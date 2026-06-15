import { t } from '@lingui/core/macro';
import { useCallback, useMemo, useState, useEffect, Fragment } from 'react';
import { modals } from '@mantine/modals';
import { IconPrinter, IconSearch, IconCheck, IconPlus } from '@tabler/icons-react';
import { Anchor, Badge, Modal, Table, Group, Button, TextInput, Skeleton, Stack, Text, ActionIcon, Tooltip, NumberInput, Popover } from '@mantine/core';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import useTable from '@lib/hooks/UseTable';
import type { TableColumn } from '@lib/types/Tables';
import type { TableFilter } from '@lib/types/Filters';
import { formatDate } from '../../defaults/formatters';
import { getDetailUrl } from '@lib/functions/Navigation';
import { useSalesOrderAllocationReturnQtyFields } from '../../forms/SalesOrderForms';
import { useEditApiFormModal } from '../../hooks/UseForm';
import { useUserState } from '../../states/UserState';
import { InvenTreeTable } from '../InvenTreeTable';
import { DateColumn } from '../ColumnRenderers';
import { api } from '../../App';
import { type RowAction } from '@lib/components/RowActions';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const formatCasesBottles = (qty: number, pkg: number) => {
  if (pkg <= 1) return `${qty}`;
  const sign = qty < 0 ? '-' : '';
  const absQty = Math.abs(qty);
  const cases = Math.floor(absQty / pkg);
  const bottles = absQty % pkg;
  return `${sign}${cases}/${bottles}`;
};

export default function ShipmentHistoryTable({
  shipmentId,
  showOrderInfo = false
}: Readonly<{
  shipmentId?: number;
  showOrderInfo?: boolean;
}>) {
  const table = useTable(
    !!shipmentId ? `shipment-history-${shipmentId}` : 'shipment-history-global'
  );

  const navigate = useNavigate();

  const user = useUserState();
  const canUpdateQty = user.hasChangeRole(UserRoles.sales_order);

  // States for shipment breakdown modal
  const [selectedShipment, setSelectedShipment] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [stockItemSearch, setStockItemSearch] = useState('');
  const [refreshModalCount, setRefreshModalCount] = useState(0);

  // States for allocation inline editing inside the modal
  const [selectedAllocation, setSelectedAllocation] = useState<any>({});
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    const handleRefreshModal = () => {
      setRefreshModalCount((prev) => prev + 1);
      table.refreshTable();
    };
    window.addEventListener('refresh-shipment-data', handleRefreshModal);
    return () => {
      window.removeEventListener('refresh-shipment-data', handleRefreshModal);
    };
  }, [table]);

  const handleCompleteShipment = (record: any) => {
    modals.openConfirmModal({
      title: <Text fw={700} size="lg">{t`Complete Shipment`}</Text>,
      children: (
        <Text size="sm">
          {t`Are you sure you want to complete and close shipment ${record.reference}? This will finalize all quantities and disable further editing.`}
        </Text>
      ),
      labels: { confirm: t`Complete`, cancel: t`Cancel` },
      confirmProps: { color: 'teal' },
      onConfirm: () => {
        const performPatch = () => {
          return api.patch(apiUrl(ApiEndpoints.sales_order_shipment_list, record.pk), {
            metadata: {
              ...record.metadata,
              closed: true
            }
          });
        };

        if (record.shipment_date) {
          performPatch()
            .then(() => {
              table.refreshTable();
              window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
            })
            .catch((err) => {
              console.error(err);
            });
        } else {
          api.post(apiUrl(ApiEndpoints.sales_order_shipment_complete, record.pk), {
            shipment_date: dayjs().format('YYYY-MM-DD')
          })
            .then(() => {
              return performPatch();
            })
            .then(() => {
              table.refreshTable();
              window.dispatchEvent(new CustomEvent('refresh-shipment-data'));

              // Refresh a second time after 1.5s to ensure the backend async completion task has settled
              setTimeout(() => {
                table.refreshTable();
                window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
              }, 1500);
            })
            .catch((err) => {
              console.error(err);
              performPatch()
                .then(() => {
                  table.refreshTable();
                  window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
                })
                .catch((patchErr) => {
                  console.error(patchErr);
                });
            });
        }
      }
    });
  };

  // States for interactive inline counting and one-by-one sales adding
  const [tempReturns, setTempReturns] = useState<Record<number, number>>({});
  const [tempCasesBottles, setTempCasesBottles] = useState<Record<number, string>>({});
  const [saleIncrements, setSaleIncrements] = useState<Record<number, number>>({});
  const [savingPartId, setSavingPartId] = useState<number | null>(null);

  const handleUpdateAllocation = (
    alloc: any,
    newReturnedQty: number | null,
    newSalesQty: number | null,
    partId: number
  ) => {
    if (!alloc?.pk) return;
    setSavingPartId(partId);

    const patchData: any = {};
    if (newReturnedQty !== null) patchData.actual_returned_qty = newReturnedQty;
    if (newSalesQty !== null) patchData.sales_qty = newSalesQty;

    api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), patchData)
      .then(() => {
        setRefreshModalCount((prev) => prev + 1);
        table.refreshTable();
        if (newReturnedQty !== null) {
          setTempReturns((prev) => {
            const next = { ...prev };
            delete next[partId];
            return next;
          });
        }
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setSavingPartId(null);
      });
  };

  const handleAddSale = (
    alloc: any,
    currentSalesQty: number,
    increment: number,
    partId: number
  ) => {
    const newSalesQty = currentSalesQty + increment;
    handleUpdateAllocation(alloc, null, newSalesQty, partId);
    setSaleIncrements((prev) => ({
      ...prev,
      [partId]: 1
    }));
  };

  // Fetch allocations for the clicked shipment
  useEffect(() => {
    if (!selectedShipment?.pk) return;
    setAllocationsLoading(true);
    api.get(apiUrl(ApiEndpoints.sales_order_allocation_list), {
      params: {
        shipment: selectedShipment.pk,
        part_detail: true,
        item_detail: true,
        order_detail: true,
        shop_detail: true,
        customer_detail: true
      }
    })
      .then((res) => {
        setAllocations(res.data || []);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setAllocationsLoading(false);
      });
  }, [selectedShipment, refreshModalCount]);

  const returnQtyFields = useSalesOrderAllocationReturnQtyFields();

  const editAllocation = useEditApiFormModal({
    url: ApiEndpoints.sales_order_allocation_list,
    pk: selectedAllocation.pk,
    fields: returnQtyFields,
    title: t`Update Sales & Return Quantities`,
    onFormSuccess: () => {
      setRefreshModalCount((prev) => prev + 1);
      table.refreshTable();
      setSelectedAllocation({});
    },
    onClose: () => {
      setSelectedAllocation({});
    }
  });

  useEffect(() => {
    if (editModalOpen && selectedAllocation?.pk) {
      editAllocation.open();
      setEditModalOpen(false);
    }
  }, [selectedAllocation, editModalOpen, editAllocation]);

  const groupedAllocations = useMemo(() => {
    const groups: { [partId: number]: any } = {};
    const processedLines = new Set<number>();

    allocations.forEach((alloc) => {
      const partId = alloc.part_detail?.pk || 0;
      if (!partId) return;

      const allocated = Number(alloc.quantity || 0);
      const sales = Number(alloc.sales_qty || 0);
      const returned = Number(alloc.actual_returned_qty || 0);

      if (!groups[partId]) {
        groups[partId] = {
          part_detail: alloc.part_detail,
          item_detail: alloc.item_detail,
          serial: alloc.serial,
          allocated: 0,
          sales: 0,
          returned: 0,
          shops: [],
          allocations: []
        };
      }

      if (alloc.line && !processedLines.has(alloc.line)) {
        processedLines.add(alloc.line);
        groups[partId].allocated += Number(alloc.line_quantity || allocated);
      } else if (!alloc.line) {
        groups[partId].allocated += allocated;
      }

      groups[partId].sales += sales;
      groups[partId].returned += returned;
      groups[partId].allocations.push(alloc);

      if (alloc.shop_detail?.name) {
        groups[partId].shops.push({
          name: alloc.shop_detail.name,
          allocated,
          sales,
          returned,
          allocInstance: alloc
        });
      }
    });

    const search = stockItemSearch.toLowerCase();
    return Object.values(groups).filter((group: any) => {
      const partName = (group.part_detail?.name || '').toLowerCase();
      const ipn = (group.part_detail?.IPN || '').toLowerCase();
      return partName.includes(search) || ipn.includes(search);
    });
  }, [allocations, stockItemSearch]);

  // Trigger professional, native print layout for the shipment breakdown (item-wise)
  const handlePrintBreakdown = () => {
    if (!selectedShipment) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = groupedAllocations.map((group: any) => {
      const variance = (Number(group.sales || 0) + Number(group.returned || 0)) - Number(group.allocated);
      const varianceStr = variance > 0 ? `+${variance}` : `${variance}`;
      const shopsList = group.shops.map((s: any) => `${s.name} (${s.allocated} allocated)`).join(', ');
      return `
        <tr>
          <td>
            <strong>${group.part_detail?.name || 'Unknown Stock Item'}</strong>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">Assigned Shops: ${shopsList}</div>
          </td>
          <td>${group.serial ? `#${group.serial}` : '---'}</td>
          <td style="text-align: right;">${group.allocated}</td>
          <td style="text-align: right;">${group.sales}</td>
          <td style="text-align: right;">${group.returned}</td>
          <td style="text-align: right; font-weight: bold; color: ${variance < 0 ? 'red' : variance > 0 ? 'green' : 'black'};">${varianceStr}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Shipment ${selectedShipment.reference} Breakdown</title>
          <style>
            body { font-family: sans-serif; margin: 40px; color: #333; }
            h1 { margin-bottom: 5px; font-size: 24px; }
            p { margin: 5px 0; color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Shipment Reference: ${selectedShipment.reference}</h1>
          <p>Sales Order: ${selectedShipment.order_detail?.reference || '---'}</p>
          <p>Shipment Date: ${selectedShipment.shipment_date ? formatDate(selectedShipment.shipment_date) : '---'}</p>
          <p>Tracking Number: ${selectedShipment.tracking_number || '---'}</p>
          <table>
            <thead>
              <tr>
                <th>Stock Item Name</th>
                <th>Serial</th>
                <th style="text-align: right;">Allocated Qty</th>
                <th style="text-align: right;">Sales Qty</th>
                <th style="text-align: right;">Returned Qty</th>
                <th style="text-align: right;">Variance</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const tableFilters: TableFilter[] = useMemo(() => {
    return [
      {
        name: 'start_date',
        label: t`Shipment Date (Min)`,
        description: t`Filter by shipment start date`,
        type: 'date'
      },
      {
        name: 'end_date',
        label: t`Shipment Date (Max)`,
        description: t`Filter by shipment end date`,
        type: 'date'
      }
    ];
  }, []);

  const tableColumns: TableColumn[] = useMemo(() => {
    const columns: TableColumn[] = [];

    if (showOrderInfo) {
      columns.push({
        accessor: 'order_detail.reference',
        title: t`Sales Order`,
        sortable: true,
        render: (record: any) => record.order_detail ? record.order_detail.reference : '---'
      });
    }

    columns.push(
      {
        accessor: 'pk',
        title: t`ID`,
        sortable: true
      },
      {
        accessor: 'reference',
        title: t`Shipment`,
        sortable: true
      },
      {
        accessor: 'shipment_date',
        title: t`Shipment Date`,
        sortable: true,
        render: (record: any) => record.shipment_date ? formatDate(record.shipment_date) : '---'
      },
      {
        accessor: 'delivery_date',
        title: t`Delivery Date`,
        sortable: true,
        render: (record: any) => record.delivery_date ? formatDate(record.delivery_date) : '---'
      },
      {
        accessor: 'status',
        title: t`Status`,
        sortable: false,
        render: (record: any) => {
          const isCompleted = record.metadata?.closed === true;
          return (
            <Badge color={isCompleted ? 'teal' : 'orange'} variant="light">
              {isCompleted ? t`Completed` : t`Ongoing`}
            </Badge>
          );
        }
      },
      {
        accessor: 'total_variance',
        title: t`Total Variance`,
        sortable: false,
        render: (record: any) => {
          const variance = Number(record.total_variance || 0);
          const varianceStr = variance > 0 ? `+${variance}` : `${variance}`;
          const color = variance < 0 ? 'red' : 'green';
          return (
            <Badge color={color} variant="light">
              {varianceStr}
            </Badge>
          );
        }
      },
      {
        accessor: 'tracking_number',
        title: t`Tracking Number`,
        sortable: false
      },
      {
        accessor: 'invoice_number',
        title: t`Invoice Number`,
        sortable: false
      },
      {
        accessor: 'complete_action',
        title: t`Complete`,
        sortable: false,
        render: (record: any) => {
          const isCompleted = record.metadata?.closed === true;
          return (
            <Button
              size="xs"
              color="teal"
              disabled={isCompleted}
              onClick={(e) => {
                e.stopPropagation();
                handleCompleteShipment(record);
              }}
            >
              {t`Complete`}
            </Button>
          );
        }
      }
    );

    return columns;
  }, [showOrderInfo]);

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      return [
        {
          title: t`View Breakdown`,
          tooltip: t`Click to see stock item breakdown and variance details`,
          onClick: () => {
            setSelectedShipment(record);
            setModalOpen(true);
          }
        }
      ];
    },
    []
  );

  return (
    <>
      {editAllocation.modal}

      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedShipment(null);
          setStockItemSearch('');
        }}
        title={<Text fw={700} size="lg">{t`Shipment Breakdown`}: {selectedShipment?.reference}</Text>}
        size="80%"
      >
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="xs" style={{ flexGrow: 1, maxWidth: '400px' }}>
              <TextInput
                placeholder={t`Filter by stock item name or IPN...`}
                size="xs"
                leftSection={<IconSearch size={14} />}
                value={stockItemSearch}
                onChange={(e) => setStockItemSearch(e.currentTarget.value)}
                style={{ flexGrow: 1 }}
              />
            </Group>
            <Group gap="xs">
              {canUpdateQty && selectedShipment?.metadata?.closed !== true && (
                <Button
                  size="xs"
                  variant="filled"
                  color="blue"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    setModalOpen(false);
                    setSelectedShipment(null);
                    setStockItemSearch('');
                    navigate(`/sales/shipment/${selectedShipment?.pk}/breakdown`);
                  }}
                >
                  {t`Add Sales`}
                </Button>
              )}
              <Button
                size="xs"
                variant="outline"
                color="blue"
                leftSection={<IconPrinter size={14} />}
                onClick={handlePrintBreakdown}
                disabled={groupedAllocations.length === 0}
              >
                {t`Print Breakdown`}
              </Button>
            </Group>
          </Group>

          {allocationsLoading ? (
            <Skeleton height={200} radius="md" animate />
          ) : groupedAllocations.length === 0 ? (
            <Text size="sm" c="dimmed" fs="italic" py="lg" style={{ textAlign: 'center' }}>
              {t`No matching stock items found in this shipment breakdown.`}
            </Text>
          ) : (
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ fontSize: '12px' }}>{t`Stock Item Name`}</Table.Th>
                  <Table.Th style={{ fontSize: '12px' }}>{t`Serial`}</Table.Th>
                  <Table.Th style={{ fontSize: '12px', textAlign: 'right' }}>{t`Allocated Qty`}</Table.Th>
                  <Table.Th style={{ fontSize: '12px', textAlign: 'right' }}>{t`Sales Qty`}</Table.Th>
                  <Table.Th style={{ fontSize: '12px', textAlign: 'right', width: '260px' }}>{t`Returned Qty`}</Table.Th>
                  <Table.Th style={{ fontSize: '12px', textAlign: 'right' }}>{t`Variance`}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groupedAllocations.map((group: any) => {
                  const partId = group.part_detail?.pk || 0;
                  const pkg = group.part_detail?.packaging || 1;
                  const allocated = Number(group.allocated || 0);
                  const sales = Number(group.sales || 0);
                  const returned = Number(group.returned || 0);
                  
                  // Compute temp value of returned quantity
                  const currentTempReturned = tempReturns[partId] !== undefined
                    ? tempReturns[partId]
                    : returned;
                    
                  const currentTempCasesBottles = tempCasesBottles[partId] !== undefined
                    ? tempCasesBottles[partId]
                    : formatCasesBottles(returned, pkg);
                    
                  const variance = (sales + currentTempReturned) - allocated;
                  const varianceStr = variance > 0 ? `+${variance}` : `${variance}`;
                  const color = variance < 0 ? 'red' : 'green';

                  const hasReturnedChanged = tempReturns[partId] !== undefined && tempReturns[partId] !== returned;

                  const handleCasesBottlesChange = (val: string) => {
                    setTempCasesBottles((prev) => ({ ...prev, [partId]: val }));

                    const valStr = val.trim();
                    if (!valStr) {
                      setTempReturns((prev) => ({ ...prev, [partId]: 0 }));
                      return;
                    }

                    let total = 0;
                    if (valStr.includes('/')) {
                      const [casePart, bottlePart] = valStr.split('/');
                      const cases = parseInt(casePart) || 0;
                      const bottles = parseInt(bottlePart) || 0;
                      total = cases * pkg + bottles;
                    } else {
                      const cases = parseInt(valStr) || 0;
                      total = cases * pkg;
                    }

                    setTempReturns((prev) => ({ ...prev, [partId]: total }));
                  };

                  const handleQuantityChange = (val: number | string) => {
                    const qtyVal = Number(val || 0);
                    setTempReturns((prev) => ({ ...prev, [partId]: qtyVal }));
                    setTempCasesBottles((prev) => ({ ...prev, [partId]: formatCasesBottles(qtyVal, pkg) }));
                  };

                  const allocatedCases = formatCasesBottles(allocated, pkg);
                  const salesCases = formatCasesBottles(sales, pkg);
                  const returnedCases = formatCasesBottles(currentTempReturned, pkg);
                  const varianceCases = formatCasesBottles(variance, pkg);

                  return (
                    <Fragment key={partId}>
                      <Table.Tr>
                        <Table.Td style={{ fontSize: '13px' }}>
                          <Tooltip
                            label={
                              <Stack gap={4} p={4}>
                                <Text size="11px" fw={700} c="white">{t`Assigned Shops`}:</Text>
                                {group.shops.map((s: any, idx: number) => (
                                  <Group key={idx} justify="space-between" gap="xl">
                                    <Text size="10px" fw={600} c="white">{s.name}</Text>
                                    <Text size="10px" c="dimmed">
                                      {t`Allocated`}: {s.allocated}
                                    </Text>
                                  </Group>
                                ))}
                              </Stack>
                            }
                            withArrow
                            position="right"
                            multiline
                          >
                            <Text size="xs" fw={600} style={{ cursor: 'help', textDecoration: 'underline dashed #aaa' }}>
                              {group.part_detail?.name || t`Unknown Stock Item`}
                            </Text>
                          </Tooltip>
                          {group.part_detail?.IPN && (
                            <Text size="10px" c="dimmed">IPN: {group.part_detail.IPN}</Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ fontSize: '13px' }}>
                          {group.serial ? (
                            <Badge size="xs" variant="outline" color="blue">#{group.serial}</Badge>
                          ) : '---'}
                        </Table.Td>
                        <Table.Td style={{ fontSize: '13px', textAlign: 'right' }}>{allocated}</Table.Td>
                        <Table.Td style={{ fontSize: '13px', textAlign: 'right' }}>
                          <Group gap="xs" justify="flex-end" style={{ flexWrap: 'nowrap' }}>
                            <Text fw={600}>{sales}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td style={{ fontSize: '13px', textAlign: 'right' }}>
                          {canUpdateQty && selectedShipment?.metadata?.closed !== true ? (
                            <Group gap="xs" justify="flex-end" style={{ flexWrap: 'nowrap' }}>
                              <TextInput
                                value={currentTempCasesBottles}
                                onChange={(e) => handleCasesBottlesChange(e.currentTarget.value)}
                                placeholder={pkg > 1 ? t`Cases/Bottles` : t`Qty`}
                                disabled={pkg <= 1}
                                size="xs"
                                style={{ width: '100px' }}
                              />
                              <NumberInput
                                value={currentTempReturned}
                                onChange={handleQuantityChange}
                                min={0}
                                step={1}
                                size="xs"
                                style={{ width: '70px' }}
                              />
                              {hasReturnedChanged && (
                                <ActionIcon
                                  size="xs"
                                  color="green"
                                  variant="light"
                                  loading={savingPartId === partId}
                                  onClick={() => {
                                    handleUpdateAllocation(group.allocations[0], currentTempReturned, null, partId);
                                    setTempCasesBottles((prev) => {
                                      const next = { ...prev };
                                      delete next[partId];
                                      return next;
                                    });
                                  }}
                                >
                                  <IconCheck size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          ) : (
                            <Text fw={600}>{returned}</Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ fontSize: '13px', textAlign: 'right' }}>
                          <Badge color={color} variant="light">
                            {varianceStr}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr style={{ backgroundColor: 'rgba(248, 249, 250, 0.4)' }}>
                        <Table.Td colSpan={2} style={{ padding: '2px 10px', borderTop: 'none' }}>
                          <Text size="10px" c="dimmed" style={{ textAlign: 'right', fontStyle: 'italic' }}>
                            {pkg > 1 ? t`Cases/Bottles` : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ padding: '2px 10px', borderTop: 'none', textAlign: 'right' }}>
                          <Text size="11px" c="dimmed" fw={500}>
                            {pkg > 1 ? allocatedCases : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ padding: '2px 10px', borderTop: 'none', textAlign: 'right' }}>
                          <Text size="11px" c="dimmed" fw={500}>
                            {pkg > 1 ? salesCases : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ padding: '2px 10px', borderTop: 'none', textAlign: 'right' }}>
                          <Text size="11px" c="dimmed" fw={500}>
                            {pkg > 1 ? returnedCases : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ padding: '2px 10px', borderTop: 'none', textAlign: 'right' }}>
                          <Text size="11px" c="dimmed" fw={500}>
                            {pkg > 1 ? varianceCases : ''}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Modal>

      <InvenTreeTable
        url={apiUrl(ApiEndpoints.sales_order_shipment_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          defaultSortColumn: 'pk',
          defaultSortDirection: 'desc',
          params: {
            order_detail: true,
            customer_detail: showOrderInfo,
            ordering: '-id'
          },
          tableFilters: tableFilters,
          rowActions: rowActions,
          enableSelection: false,
          enableSearch: true,
          enableFilters: true
        }}
      />
    </>
  );
}
