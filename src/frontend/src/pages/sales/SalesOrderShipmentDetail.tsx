import { t } from '@lingui/core/macro';
import {
  Grid,
  Skeleton,
  Stack,
  Text,
  Card,
  Badge,
  Divider,
  Paper,
  SimpleGrid,
  RingProgress,
  Group,
  Center,
  Table,
  Select,
  TextInput,
  Button,
  Modal,
  NumberInput,
  ActionIcon,
  Alert
} from '@mantine/core';
import {
  IconBookmark,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
  IconBuildingStore,
  IconPackage,
  IconAlertCircle,
  IconTruckDelivery,
  IconCheck,
  IconHistory
} from '@tabler/icons-react';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { getDetailUrl } from '@lib/functions/Navigation';
import AdminButton from '../../components/buttons/AdminButton';
import PrimaryActionButton from '../../components/buttons/PrimaryActionButton';
import { PrintingActions } from '../../components/buttons/PrintingActions';
import {
  type DetailsField,
  DetailsTable
} from '../../components/details/Details';
import { DetailsImage } from '../../components/details/DetailsImage';
import { ItemDetailsGrid } from '../../components/details/ItemDetails';
import {
  BarcodeActionDropdown,
  CancelItemAction,
  EditItemAction,
  OptionsActionDropdown
} from '../../components/items/ActionDropdown';
import InstanceDetail from '../../components/nav/InstanceDetail';
import { PageDetail } from '../../components/nav/PageDetail';
import AttachmentPanel from '../../components/panels/AttachmentPanel';
import NotesPanel from '../../components/panels/NotesPanel';
import type { PanelType } from '../../components/panels/Panel';
import { PanelGroup } from '../../components/panels/PanelGroup';
import ParametersPanel from '../../components/panels/ParametersPanel';
import { RenderAddress } from '../../components/render/Company';
import { RenderUser } from '../../components/render/User';
import { formatDate } from '../../defaults/formatters';
import {
  useCheckShipmentForm,
  useCompleteShipmentForm,
  useSalesOrderShipmentFields,
  useUncheckShipmentForm
} from '../../forms/SalesOrderForms';
import {
  useDeleteApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { useInstance } from '../../hooks/UseInstance';
import { useUserState } from '../../states/UserState';
import SalesOrderAllocationTable from '../../tables/sales/SalesOrderAllocationTable';
import ShipmentShopTable from '../../tables/sales/ShipmentShopTable';
import ShipmentHistoryTable from '../../tables/sales/ShipmentHistoryTable';
import { api } from '../../App';

const formatCasesBottles = (qty: number, pkg: number) => {
  if (pkg <= 1) return `${qty}`;
  const sign = qty < 0 ? '-' : '';
  const absQty = Math.abs(qty);
  const cases = Math.floor(absQty / pkg);
  const bottles = absQty % pkg;
  return `${sign}${cases}/${bottles}`;
};

export function ShipmentDeliveryBreakdown({
  shipmentId,
  isPending,
  isClosed = false,
  onAllocationsChange
}: Readonly<{
  shipmentId: number;
  isPending: boolean;
  isClosed?: boolean;
  onAllocationsChange?: (totalQty: number, unassignedQty: number) => void;
}>) {
  const [shops, setShops] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [assigningId, setAssigningId] = useState<string | number | null>(null);

  // selectedShops handles the shop select dropdown in the unassigned list
  const [selectedShops, setSelectedShops] = useState<Record<string, string>>({});

  // assigningQuantities handles the split quantity NumberInput in the unassigned list
  const [assigningQuantities, setAssigningQuantities] = useState<Record<string, number>>({});
  const [assigningCasesBottles, setAssigningCasesBottles] = useState<Record<string, string>>({});



  const [shopsModalOpen, setShopsModalOpen] = useState(false);

  // Track selected shop for quick assignment
  const [quickAssignShop, setQuickAssignShop] = useState<string | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const [tempReturnedQtys, setTempReturnedQtys] = useState<Record<number, number>>({});
  const [tempSalesQtys, setTempSalesQtys] = useState<Record<number, number>>({});

  const handleUpdateAllocation = (
    alloc: any,
    newReturnedQty: number | null,
    newSalesQty: number | null
  ) => {
    if (!alloc?.pk) return;
    setAssigningId(alloc.pk);

    const patchData: any = {};
    if (newReturnedQty !== null) patchData.actual_returned_qty = newReturnedQty;
    if (newSalesQty !== null) patchData.sales_qty = newSalesQty;

    api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), patchData)
      .then(() => {
        setRefreshCount((prev) => prev + 1);
        window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setAssigningId(null);
      });
  };

  const location = useLocation();
  const highlightPartId = useMemo(() => {
    const hash = location.hash;
    if (hash.startsWith('#part-')) {
      return Number(hash.substring(6));
    }
    return null;
  }, [location.hash]);

  useEffect(() => {
    if (highlightPartId) {
      const timer = setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightPartId]);

  useEffect(() => {
    if (highlightPartId) {
      setTimeout(() => {
        const element = document.getElementById(`part-row-${highlightPartId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [highlightPartId]);

  useEffect(() => {
    const handleRefresh = () => {
      setRefreshCount((prev) => prev + 1);
    };
    window.addEventListener('refresh-shipment-data', handleRefresh);
    return () => {
      window.removeEventListener('refresh-shipment-data', handleRefresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      api.get(apiUrl(ApiEndpoints.sales_order_shipment_shop_list), {
        params: { shipment: shipmentId }
      }),
      api.get(apiUrl(ApiEndpoints.sales_order_allocation_list), {
        params: {
          shipment: shipmentId,
          part_detail: true,
          item_detail: true
        }
      })
    ])
      .then(([shopsRes, allocationsRes]) => {
        if (!active) return;
        setShops(shopsRes.data || []);
        setAllocations(allocationsRes.data || []);

        // Initialize assigningQuantities with current quantity of grouped allocations
        const initialQuantities: Record<string, number> = {};
        if (allocationsRes.data) {
          allocationsRes.data.filter((a: any) => !a.shop).forEach((alloc: any) => {
            const key = `${alloc.part_detail?.pk || ''}-${alloc.serial || ''}-${alloc.item_detail?.batch || ''}`;
            if (!initialQuantities[key]) initialQuantities[key] = 0;
            initialQuantities[key] += Number(alloc.quantity || 0);
          });
        }
        setAssigningQuantities(initialQuantities);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shipmentId, refreshCount]);

  // Calculate statistics
  const totalAllocationsQty = allocations.reduce((acc, a) => acc + (a.quantity || 0), 0);
  const assignedAllocationsQty = allocations
    .filter((a) => !!a.shop)
    .reduce((acc, a) => acc + (a.quantity || 0), 0);
  const unassignedAllocations = allocations.filter((a) => !a.shop);
  const unassignedAllocationsQty = unassignedAllocations.reduce(
    (acc, a) => acc + (a.quantity || 0),
    0
  );

  const allocatedQtySum = useMemo(() => {
    const uniqueLines = new Set<number>();
    let sum = 0;
    allocations.forEach((alloc) => {
      if (alloc.line) {
        if (!uniqueLines.has(alloc.line)) {
          uniqueLines.add(alloc.line);
          sum += Number(alloc.line_quantity || 0);
        }
      } else {
        sum += Number(alloc.quantity || 0);
      }
    });
    return sum;
  }, [allocations]);
  
  // Call the callback to synchronize quantities with parent component
  useEffect(() => {
    if (!loading) {
      onAllocationsChange?.(totalAllocationsQty, unassignedAllocationsQty);
    }
  }, [loading, totalAllocationsQty, unassignedAllocationsQty, onAllocationsChange]);

  const groupedUnassignedAllocations = useMemo(() => {
    const map = new Map<string, any>();
    allocations.forEach((alloc) => {
      const key = `${alloc.part_detail?.pk || ''}-${alloc.serial || ''}-${alloc.item_detail?.batch || ''}`;
      if (map.has(key)) {
        const existing = map.get(key);
        existing.allocations.push(alloc);
        if (!alloc.shop) {
          existing.quantity += Number(alloc.quantity || 0);
        }
      } else {
        map.set(key, {
          ...alloc,
          groupKey: key,
          allocations: [alloc],
          quantity: !alloc.shop ? Number(alloc.quantity || 0) : 0
        });
      }
    });
    return Array.from(map.values());
  }, [allocations]);

  const handleAssignGrouped = (groupKey: string, shopIdStr: string) => {
    const shopId = Number(shopIdStr);
    const group = groupedUnassignedAllocations.find(g => g.groupKey === groupKey);
    if (!group) return;

    let qtyToAssign = Number(assigningQuantities[groupKey] ?? group.quantity);
    if (!qtyToAssign || qtyToAssign <= 0) return;

    setAssigningId(groupKey);

    const firstAlloc = group.allocations.find((a: any) => !a.shop) || group.allocations[0];
    if (!firstAlloc) return;

    const existingShopAlloc = allocations.find(
      (a) =>
        a.shop === shopId &&
        a.line === firstAlloc.line &&
        a.item === firstAlloc.item
    );

    const promises = [];
    const unassignedAllocationsInGroup = group.allocations.filter((a: any) => !a.shop);
    const totalUnassignedQty = unassignedAllocationsInGroup.reduce((acc: number, a: any) => acc + Number(a.quantity || 0), 0);

    if (existingShopAlloc) {
      promises.push(
        api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, existingShopAlloc.pk), {
          quantity: Number(existingShopAlloc.quantity || 0) + qtyToAssign,
          sales_qty: Number(existingShopAlloc.sales_qty || 0) + qtyToAssign
        })
      );

      let remainingToReduce = qtyToAssign;
      for (const alloc of unassignedAllocationsInGroup) {
        if (remainingToReduce <= 0) break;
        const allocQty = Number(alloc.quantity || 0);
        if (allocQty <= remainingToReduce) {
          remainingToReduce -= allocQty;
          promises.push(
            api.delete(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk))
          );
        } else {
          promises.push(
            api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
              quantity: allocQty - remainingToReduce
            })
          );
          remainingToReduce = 0;
        }
      }
    } else {
      if (qtyToAssign < totalUnassignedQty) {
        promises.push(
          api.post(apiUrl(ApiEndpoints.sales_order_allocation_list), {
            line: firstAlloc.line,
            shipment: shipmentId,
            item: firstAlloc.item,
            shop: shopId,
            quantity: qtyToAssign,
            sales_qty: qtyToAssign
          })
        );

        let remainingToReduce = qtyToAssign;
        for (const alloc of unassignedAllocationsInGroup) {
          if (remainingToReduce <= 0) break;
          const allocQty = Number(alloc.quantity || 0);
          if (allocQty <= remainingToReduce) {
            remainingToReduce -= allocQty;
            promises.push(
              api.delete(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk))
            );
          } else {
            promises.push(
              api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                quantity: allocQty - remainingToReduce
              })
            );
            remainingToReduce = 0;
          }
        }
      } else {
        let remainingToAssign = qtyToAssign;
        let isFirst = true;
        for (const alloc of unassignedAllocationsInGroup) {
          const allocQty = Number(alloc.quantity || 0);
          if (isFirst) {
            isFirst = false;
            const extraQty = qtyToAssign - totalUnassignedQty;
            promises.push(
              api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                shop: shopId,
                quantity: allocQty + extraQty,
                sales_qty: allocQty + extraQty
              })
            );
          } else {
            promises.push(
              api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                shop: shopId,
                sales_qty: allocQty
              })
            );
          }
        }

        if (unassignedAllocationsInGroup.length === 0) {
          promises.push(
            api.post(apiUrl(ApiEndpoints.sales_order_allocation_list), {
              line: firstAlloc.line,
              shipment: shipmentId,
              item: firstAlloc.item,
              shop: shopId,
              quantity: qtyToAssign,
              sales_qty: qtyToAssign
            })
          );
        }
      }
    }

    Promise.all(promises)
      .then(() => {
        setRefreshCount((prev) => prev + 1);
        window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
        setSelectedShops((prev) => {
          const next = { ...prev };
          delete next[groupKey];
          return next;
        });
        setAssigningCasesBottles((prev) => {
          const next = { ...prev };
          delete next[groupKey];
          return next;
        });
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setAssigningId(null);
      });
  };

  const handleAssignAll = (shopIdStr: string) => {
    const shopId = Number(shopIdStr);
    if (!shopId) return;

    setBulkAssigning(true);
    const promises = groupedUnassignedAllocations.map((group) => {
      let qty = Number(assigningQuantities[group.groupKey] ?? group.quantity);
      if (!qty || qty <= 0) return Promise.resolve();

      const groupPromises = [];
      const firstAlloc = group.allocations.find((a: any) => !a.shop) || group.allocations[0];
      if (!firstAlloc) return Promise.resolve();

      const existingShopAlloc = allocations.find(
        (a) =>
          a.shop === shopId &&
          a.line === firstAlloc.line &&
          a.item === firstAlloc.item
      );

      const unassignedAllocationsInGroup = group.allocations.filter((a: any) => !a.shop);
      const totalUnassignedQty = unassignedAllocationsInGroup.reduce((acc: number, a: any) => acc + Number(a.quantity || 0), 0);

      if (existingShopAlloc) {
        groupPromises.push(
          api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, existingShopAlloc.pk), {
            quantity: Number(existingShopAlloc.quantity || 0) + qty,
            sales_qty: Number(existingShopAlloc.sales_qty || 0) + qty
          })
        );

        let remainingToReduce = qty;
        for (const alloc of unassignedAllocationsInGroup) {
          if (remainingToReduce <= 0) break;
          const allocQty = Number(alloc.quantity || 0);
          if (allocQty <= remainingToReduce) {
            remainingToReduce -= allocQty;
            groupPromises.push(
              api.delete(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk))
            );
          } else {
            groupPromises.push(
              api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                quantity: allocQty - remainingToReduce
              })
            );
            remainingToReduce = 0;
          }
        }
      } else {
        if (qty < totalUnassignedQty) {
          groupPromises.push(
            api.post(apiUrl(ApiEndpoints.sales_order_allocation_list), {
              line: firstAlloc.line,
              shipment: shipmentId,
              item: firstAlloc.item,
              shop: shopId,
              quantity: qty,
              sales_qty: qty
            })
          );

          let remainingToReduce = qty;
          for (const alloc of unassignedAllocationsInGroup) {
            if (remainingToReduce <= 0) break;
            const allocQty = Number(alloc.quantity || 0);
            if (allocQty <= remainingToReduce) {
              remainingToReduce -= allocQty;
              groupPromises.push(
                api.delete(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk))
              );
            } else {
              groupPromises.push(
                api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                  quantity: allocQty - remainingToReduce
                })
              );
              remainingToReduce = 0;
            }
          }
        } else {
          let remainingToAssign = qty;
          let isFirst = true;
          for (const alloc of unassignedAllocationsInGroup) {
            const allocQty = Number(alloc.quantity || 0);
            if (isFirst) {
              isFirst = false;
              const extraQty = qty - totalUnassignedQty;
              groupPromises.push(
                api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                  shop: shopId,
                  quantity: allocQty + extraQty,
                  sales_qty: allocQty + extraQty
                })
              );
            } else {
              groupPromises.push(
                api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, alloc.pk), {
                  shop: shopId,
                  sales_qty: allocQty
                })
              );
            }
          }

          if (unassignedAllocationsInGroup.length === 0) {
            groupPromises.push(
              api.post(apiUrl(ApiEndpoints.sales_order_allocation_list), {
                line: firstAlloc.line,
                shipment: shipmentId,
                item: firstAlloc.item,
                shop: shopId,
                quantity: qty,
                sales_qty: qty
              })
            );
          }
        }
      }
      return Promise.all(groupPromises);
    });

    Promise.all(promises)
      .then(() => {
        setRefreshCount((prev) => prev + 1);
        window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
        setQuickAssignShop(null);
        setAssigningCasesBottles({});
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setBulkAssigning(false);
      });
  };

  const handleUnassign = (allocationId: number) => {
    setAssigningId(allocationId);
    
    const allocToUnassign = allocations.find(a => a.pk === allocationId);
    if (!allocToUnassign) return;

    const otherUnassigned = allocations.find(
      (a) =>
        a.pk !== allocationId &&
        !a.shop &&
        a.line === allocToUnassign.line &&
        a.item === allocToUnassign.item
    );

    if (otherUnassigned) {
      const newQty = Number(otherUnassigned.quantity || 0) + Number(allocToUnassign.quantity || 0);
      api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, otherUnassigned.pk), {
        quantity: newQty
      })
        .then(() => {
          return api.delete(apiUrl(ApiEndpoints.sales_order_allocation_list, allocationId));
        })
        .then(() => {
          setRefreshCount((prev) => prev + 1);
          window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
        })
        .catch((err) => {
          console.error(err);
        })
        .finally(() => {
          setAssigningId(null);
        });
    } else {
      api.patch(apiUrl(ApiEndpoints.sales_order_allocation_list, allocationId), {
        shop: null,
        sales_qty: 0
      })
        .then(() => {
          setRefreshCount((prev) => prev + 1);
          window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
        })
        .catch((err) => {
          console.error(err);
        })
        .finally(() => {
          setAssigningId(null);
        });
    }
  };



  if (loading) {
    return <Skeleton height={200} radius="md" animate />;
  }

  const progressPercent =
    totalAllocationsQty > 0
      ? Math.round((assignedAllocationsQty / totalAllocationsQty) * 100)
      : 0;

  // Group allocations by shop pk
  const shopAllocationsMap = new Map<number, any[]>();
  for (const shop of shops) {
    shopAllocationsMap.set(shop.pk, []);
  }
  for (const alloc of allocations) {
    if (alloc.shop) {
      const list = shopAllocationsMap.get(alloc.shop) || [];
      list.push(alloc);
      shopAllocationsMap.set(alloc.shop, list);
    }
  }

  return (
    <>
      <Modal
        opened={shopsModalOpen}
        onClose={() => {
          setShopsModalOpen(false);
          setRefreshCount((prev) => prev + 1);
        }}
        title={t`Manage Delivery Shops`}
        size="75%"
      >
        <ShipmentShopTable shipmentId={shipmentId} allowEdit={!isClosed} />
      </Modal>

      <Stack gap="lg">
        {isClosed && (
          <Alert color="teal" icon={<IconCircleCheck size={20} />} title={t`Closed Shipment`}>
            {t`This shipment has been submitted and closed. All shop assignments, sales quantities, and return quantities are finalized.`}
          </Alert>
        )}
        {!isClosed && !isPending && (
          <Paper p="md" withBorder radius="md" style={{ background: 'rgba(252, 196, 25, 0.05)', border: '1px solid #ffd8a8' }}>
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text fw={600} size="sm" style={{ color: '#d9480f' }}>{t`Ongoing Delivery Breakdown`}</Text>
                <Text size="xs" c="dimmed">
                  {t`Please assign items to shops, specify returns, and review quantities. Once finalized, click "Submit & Close Shipment" in the actions menu above.`}
                </Text>
              </Stack>
            </Group>
          </Paper>
        )}
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {/* Progress Card */}
          <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{
              background: 'linear-gradient(135deg, rgba(26, 36, 43, 0.95) 0%, rgba(13, 20, 24, 0.95) 100%)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '260px'
            }}
          >
            <Text size="md" fw={600} c="dimmed" mb="md" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              {t`Delivery Progress`}
            </Text>
            <RingProgress
              size={160}
              roundCaps
              thickness={14}
              sections={[{ value: progressPercent, color: '#38d9a9' }]}
              label={
                <Center>
                  <Stack gap={0} align="center">
                    <Text fw={700} size="xl" style={{ color: '#fff' }}>
                      {progressPercent}%
                    </Text>
                    <Text size="xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                      {t`Assigned`}
                    </Text>
                  </Stack>
                </Center>
              }
            />
            <Group justify="space-between" mt="md" style={{ width: '100%' }}>
              <Stack gap={2} align="center">
                <Text size="xs" style={{ color: '#4dabf7' }}>{t`Allocated Qty`}</Text>
                <Text fw={600} size="sm" style={{ color: '#4dabf7' }}>{allocatedQtySum}</Text>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>{t`Total Items`}</Text>
                <Text fw={600} size="sm">{totalAllocationsQty}</Text>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" style={{ color: '#38d9a9' }}>{t`Assigned`}</Text>
                <Text fw={600} size="sm" style={{ color: '#38d9a9' }}>{assignedAllocationsQty}</Text>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" style={{ color: '#ffc078' }}>{t`Unassigned`}</Text>
                <Text fw={600} size="sm" style={{ color: '#ffc078' }}>{unassignedAllocationsQty}</Text>
              </Stack>
            </Group>
          </Card>

          {/* Shops Card Breakdown */}
          <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{
              gridColumn: 'span 2',
              background: 'rgba(255, 255, 255, 0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <Group justify="space-between" align="center" style={{ width: '100%' }}>
              <Text size="lg" fw={700} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconBuildingStore size={22} style={{ color: '#4dabf7' }} />
                {t`Shop Assignments`}
              </Text>
              {!isClosed && (
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<IconBuildingStore size={14} />}
                  onClick={() => setShopsModalOpen(true)}
                >
                  {t`Manage Shops`}
                </Button>
              )}
            </Group>
            <Divider />
            
            {shops.length === 0 ? (
              <Center style={{ flexGrow: 1, padding: '24px' }}>
                <Stack align="center" gap="xs">
                  <IconBuildingStore size={40} style={{ opacity: 0.4 }} />
                  <Text size="sm" c="dimmed">{t`No delivery shops registered for this shipment.`}</Text>
                  {!isClosed && (
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => setShopsModalOpen(true)}
                      mt="xs"
                    >
                      {t`Add/Manage Shops`}
                    </Button>
                  )}
                </Stack>
              </Center>
          ) : (
            <Stack gap="md" style={{ overflowY: 'auto', maxHeight: '400px' }}>
              {[...shops]
                .sort((a, b) => {
                  if (quickAssignShop) {
                    if (a.pk.toString() === quickAssignShop) return -1;
                    if (b.pk.toString() === quickAssignShop) return 1;
                  }
                  return 0;
                })
                .map((shop) => {
                  const assigned = shopAllocationsMap.get(shop.pk) || [];
                  const assignedQty = assigned.reduce((acc, a) => acc + (a.quantity || 0), 0);
                  const isHighlighted = quickAssignShop === shop.pk.toString();

                  return (
                    <Paper
                      key={shop.pk}
                      withBorder
                      p="md"
                      radius="md"
                      style={{
                        transition: 'all 0.3s ease',
                        border: isHighlighted ? '2px solid #40c057' : undefined,
                        background: isHighlighted ? 'rgba(64, 192, 87, 0.04)' : undefined,
                        transform: isHighlighted ? 'scale(1.01)' : undefined,
                        boxShadow: isHighlighted ? '0 4px 12px rgba(0, 0, 0, 0.05)' : undefined
                      }}
                    >
                    <Group justify="space-between" mb="xs" align="flex-start">
                      <Stack gap={4}>
                        <Group gap="xs">
                          <Text fw={600} size="md">{shop.name}</Text>
                          <Badge color="blue" variant="light">{assigned.length} {t`allocations`}</Badge>
                          <Badge color="teal" variant="light">{assignedQty} {t`items`}</Badge>
                        </Group>
                        <Text size="xs" c="dimmed">{shop.address}</Text>
                        {shop.contact_name && (
                          <Text size="xs" c="dimmed">
                            {t`Contact`}: {shop.contact_name} ({shop.contact_phone})
                          </Text>
                        )}
                      </Stack>
                    </Group>

                    {assigned.length === 0 ? (
                      <Text size="xs" c="dimmed" fs="italic" mt="xs">
                        {t`No items assigned to this shop yet.`}
                      </Text>
                    ) : (
                      <div style={{ overflowX: 'auto', width: '100%' }}>
                        <Table mt="sm" verticalSpacing="xs" striped highlightOnHover style={{ minWidth: '680px' }}>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ fontSize: '11px', minWidth: '130px' }}>{t`Stock Item`}</Table.Th>
                            <Table.Th style={{ fontSize: '11px', minWidth: '80px', textAlign: 'right' }}>{t`Allocated Qty`}</Table.Th>
                            {!isClosed && <Table.Th style={{ minWidth: '80px' }} />}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {assigned.map((alloc) => {
                            const pkg = alloc.part_detail?.packaging || 1;
                            return (
                            <Table.Tr
                              key={alloc.pk}
                              id={`part-row-${alloc.part_detail?.pk}`}
                              style={{
                                transition: 'background-color 0.8s ease',
                                backgroundColor: alloc.part_detail?.pk === highlightPartId ? 'rgba(255, 192, 120, 0.25)' : undefined
                              }}
                            >
                              {/* Stock Item */}
                              <Table.Td style={{ fontSize: '12px' }}>
                                <Text fw={500} size="xs">
                                  {alloc.part_detail?.name || t`Unknown Stock Item`}
                                </Text>
                                {alloc.part_detail?.IPN && (
                                  <Text size="10px" c="dimmed">IPN: {alloc.part_detail.IPN}</Text>
                                )}
                                {alloc.serial ? (
                                  <Badge size="xs" variant="outline" color="blue">#{alloc.serial}</Badge>
                                ) : alloc.item_detail?.batch ? (
                                  <Badge size="xs" variant="outline" color="gray">Batch: {alloc.item_detail.batch}</Badge>
                                ) : null}
                              </Table.Td>

                              {/* Allocated Qty — read-only */}
                              <Table.Td style={{ fontSize: '12px', textAlign: 'right' }}>
                                <Group gap="xs" justify="flex-end" style={{ flexWrap: 'nowrap' }}>
                                  <Badge color="indigo" variant="light" size="sm">{alloc.quantity}</Badge>
                                  {pkg > 1 && (
                                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                      ({formatCasesBottles(alloc.quantity, pkg)})
                                    </Text>
                                  )}
                                </Group>
                              </Table.Td>

                              {/* Unassign */}
                              {!isClosed && (
                                <Table.Td style={{ textAlign: 'right' }}>
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    color="red"
                                    loading={assigningId === alloc.pk}
                                    onClick={() => handleUnassign(alloc.pk)}
                                  >
                                    {t`Unassign`}
                                  </Button>
                                </Table.Td>
                              )}
                            </Table.Tr>
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                      </div>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Card>
      </SimpleGrid>
      {/* Unassigned Stock Items Panel */}
      {!isClosed && groupedUnassignedAllocations.length > 0 && (
        <Card
          shadow="sm"
          padding="lg"
          radius="md"
          style={{
            border: '1px solid #ffd8a8',
            background: 'rgba(255, 192, 120, 0.05)'
          }}
        >
          <Group justify="space-between" align="center" mb="md" style={{ flexWrap: 'wrap', gap: '16px' }}>
            <Group gap="sm">
              <IconAlertCircle size={24} style={{ color: '#f76707' }} />
              <div>
                <Text fw={600} size="md" style={{ color: '#d9480f' }}>
                  {t`Unassigned Stock Items`} ({groupedUnassignedAllocations.length})
                </Text>
                <Text size="xs" c="dimmed">
                  {t`These allocated stock items have not yet been assigned to a delivery shop.`}
                </Text>
              </div>
            </Group>
            {!isClosed && shops.length > 0 && (
              <Group gap="xs" align="center" style={{ flexWrap: 'nowrap' }}>
                <Text size="xs" fw={500} c="dimmed" style={{ whiteSpace: 'nowrap' }}>{t`Quick Assign to Shop`}:</Text>
                <Select
                  placeholder={t`Select shop...`}
                  size="xs"
                  style={{ width: '200px' }}
                  data={shops.map((s) => ({ value: s.pk.toString(), label: s.name }))}
                  value={quickAssignShop}
                  onChange={(val) => setQuickAssignShop(val)}
                  clearable
                />
                {quickAssignShop && (
                  <Button
                    size="xs"
                    color="green"
                    leftSection={<IconCheck size={14} />}
                    loading={bulkAssigning}
                    onClick={() => handleAssignAll(quickAssignShop)}
                  >
                    {t`Assign All`}
                  </Button>
                )}
              </Group>
            )}
          </Group>
          
          <Table verticalSpacing="xs" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ fontSize: '12px' }}>{t`Stock Item`}</Table.Th>
                <Table.Th style={{ fontSize: '12px' }}>{t`Serial/Batch`}</Table.Th>
                <Table.Th style={{ fontSize: '12px', textAlign: 'right' }}>{t`Allocated Qty`}</Table.Th>
                {!isClosed && shops.length > 0 && (
                  <Table.Th style={{ fontSize: '12px', width: '450px' }}>
                    {quickAssignShop 
                      ? `${t`Assign to`} ${shops.find((s) => s.pk.toString() === quickAssignShop)?.name}` 
                      : t`Assign to Shop`
                    }
                  </Table.Th>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groupedUnassignedAllocations.map((group) => {
                const currentShopVal = selectedShops[group.groupKey] || '';
                const pkg = group.part_detail?.packaging || 1;
                const currentQty = assigningQuantities[group.groupKey] ?? group.quantity;
                const currentCasesBottles = assigningCasesBottles[group.groupKey] !== undefined
                  ? assigningCasesBottles[group.groupKey]
                  : formatCasesBottles(group.quantity, pkg);

                const handleCasesBottlesChange = (val: string) => {
                  setAssigningCasesBottles((prev) => ({
                    ...prev,
                    [group.groupKey]: val
                  }));

                  const valStr = val.trim();
                  if (!valStr) {
                    setAssigningQuantities((prev) => ({
                      ...prev,
                      [group.groupKey]: 0
                    }));
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

                  // Removed capping of total to group.quantity to allow assigning any quantity.

                  setAssigningQuantities((prev) => ({
                    ...prev,
                    [group.groupKey]: total
                  }));
                };

                const handleQuantityChange = (val: number | string) => {
                  let qtyVal = Number(val || 0);
                  setAssigningQuantities((prev) => ({
                    ...prev,
                    [group.groupKey]: qtyVal
                  }));
                  setAssigningCasesBottles((prev) => ({
                    ...prev,
                    [group.groupKey]: formatCasesBottles(qtyVal, pkg)
                  }));
                };

                return (
                  <Table.Tr key={group.groupKey}>
                    <Table.Td>
                      <Text fw={500} size="sm">
                        {group.part_detail?.name || t`Unknown Stock Item`}
                      </Text>
                      {group.part_detail?.IPN && (
                        <Text size="xs" c="dimmed">
                          IPN: {group.part_detail.IPN}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {group.serial ? (
                        <Badge size="xs" variant="outline" color="blue">
                          #{group.serial}
                        </Badge>
                      ) : group.item_detail?.batch ? (
                        <Badge size="xs" variant="outline" color="gray">
                          Batch: {group.item_detail.batch}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">---</Text>
                      )}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Group gap="xs" justify="flex-end" style={{ flexWrap: 'nowrap' }}>
                        <Text fw={600}>{group.quantity}</Text>
                        {pkg > 1 && (
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            ({formatCasesBottles(group.quantity, pkg)})
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                    {!isClosed && shops.length > 0 && (
                      <Table.Td>
                        <Group gap="xs" style={{ flexWrap: 'nowrap' }}>
                          <TextInput
                            value={currentCasesBottles}
                            onChange={(e) => handleCasesBottlesChange(e.currentTarget.value)}
                            placeholder={pkg > 1 ? t`Cases/Bottles` : t`Qty`}
                            disabled={pkg <= 1}
                            size="xs"
                            style={{ width: '100px' }}
                          />
                          <NumberInput
                            size="xs"
                            style={{ width: '70px' }}
                            value={currentQty}
                            onChange={handleQuantityChange}
                            min={0}
                            step={1}
                          />
                          {quickAssignShop ? (
                            <Button
                              size="xs"
                              color="green"
                              leftSection={<IconCheck size={14} />}
                              disabled={!(currentQty > 0)}
                              loading={assigningId === group.groupKey}
                              onClick={() => handleAssignGrouped(group.groupKey, quickAssignShop)}
                              style={{ flexGrow: 1 }}
                            >
                              {t`Assign`}
                            </Button>
                          ) : (
                            <>
                              <Select
                                placeholder={t`Select shop`}
                                size="xs"
                                style={{ flexGrow: 1 }}
                                data={shops.map((s) => ({ value: s.pk.toString(), label: s.name }))}
                                value={currentShopVal}
                                onChange={(val) => {
                                  if (val) {
                                    setSelectedShops((prev) => ({
                                      ...prev,
                                      [group.groupKey]: val
                                    }));
                                  }
                                }}
                              />
                              <Button
                                size="xs"
                                color="blue"
                                disabled={!currentShopVal || !(currentQty > 0)}
                                loading={assigningId === group.groupKey}
                                onClick={() => handleAssignGrouped(group.groupKey, currentShopVal)}
                              >
                                {t`Assign`}
                              </Button>
                            </>
                          )}
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {!isClosed && unassignedAllocationsQty === 0 && totalAllocationsQty > 0 && (
        <Card
          shadow="sm"
          padding="md"
          radius="md"
          style={{
            border: '1px solid #b2f2bb',
            background: 'rgba(178, 242, 187, 0.1)'
          }}
        >
          <Group gap="xs">
            <IconCircleCheck size={20} style={{ color: '#2b8a3e' }} />
            <Text fw={500} size="sm" style={{ color: '#2b8a3e' }}>
              {t`All allocated stock items are fully assigned to shops!`}
            </Text>
          </Group>
        </Card>
      )}
      </Stack>
    </>
  );
}

export default function SalesOrderShipmentDetail() {
  const { id } = useParams();
  const user = useUserState();
  const navigate = useNavigate();

  const [unassignedQty, setUnassignedQty] = useState<number>(1);
  const [totalQty, setTotalQty] = useState<number>(0);

  const userId = useMemo(() => user.userId(), [user]);

  const {
    instance: shipment,
    instanceQuery: shipmentQuery,
    refreshInstance: refreshShipment
  } = useInstance({
    endpoint: ApiEndpoints.sales_order_shipment_list,
    pk: id,
    params: {
      order_detail: true
    }
  });

  const { instance: customer, instanceQuery: customerQuery } = useInstance({
    endpoint: ApiEndpoints.company_list,
    pk: shipment.order_detail?.customer,
    hasPrimaryKey: true
  });

  useEffect(() => {
    const handleRefresh = () => {
      refreshShipment();
    };
    window.addEventListener('refresh-shipment-data', handleRefresh);
    return () => {
      window.removeEventListener('refresh-shipment-data', handleRefresh);
    };
  }, [refreshShipment]);

  const isPending = useMemo(() => !shipment.shipment_date, [shipment]);

  const handleCloseShipment = () => {
    const confirmClose = window.confirm(
      t`Are you sure you want to submit and close this shipment? This will finalize all quantities and disable further editing.`
    );
    if (!confirmClose) return;

    api.patch(apiUrl(ApiEndpoints.sales_order_shipment_list, shipment.pk), {
      metadata: {
        ...shipment.metadata,
        closed: true
      }
    })
      .then(() => {
        refreshShipment();
        window.dispatchEvent(new CustomEvent('refresh-shipment-data'));
      })
      .catch((err) => {
        console.error(err);
      });
  };

  const isChecked = useMemo(() => !!shipment.checked_by, [shipment]);

  const detailsPanel = useMemo(() => {
    if (shipmentQuery.isFetching || customerQuery.isFetching) {
      return <Skeleton />;
    }

    const data: any = {
      ...shipment,
      customer: customer?.pk,
      customer_name: customer?.name,
      customer_reference: shipment.order_detail?.customer_reference
    };

    // Top Left: Order / customer information
    const tl: DetailsField[] = [
      {
        type: 'link',
        model: ModelType.salesorder,
        name: 'order',
        label: t`Sales Order`,
        icon: 'sales_orders',
        model_field: 'reference'
      },
      {
        type: 'link',
        name: 'customer',
        icon: 'customers',
        label: t`Customer`,
        model: ModelType.company,
        model_field: 'name',
        hidden: !data.customer
      },
      {
        type: 'link',
        external: true,
        name: 'link',
        label: t`Link`,
        copy: true,
        hidden: !shipment.link
      }
    ];

    // Top right: Shipment information
    const tr: DetailsField[] = [
      {
        type: 'text',
        name: 'customer_reference',
        icon: 'serial',
        label: t`Customer Reference`,
        hidden: !data.customer_reference,
        copy: true
      },
      {
        type: 'text',
        name: 'reference',
        icon: 'serial',
        label: t`Shipment Reference`,
        copy: true
      },
      {
        type: 'text',
        name: 'tracking_number',
        label: t`Tracking Number`,
        icon: 'trackable',
        value_formatter: () => shipment.tracking_number || '---',
        copy: !!shipment.tracking_number
      },
      {
        type: 'text',
        name: 'invoice_number',
        label: t`Invoice Number`,
        icon: 'serial',
        value_formatter: () => shipment.invoice_number || '---',
        copy: !!shipment.invoice_number
      }
    ];

    const address: any =
      shipment.shipment_address_detail || shipment.order_detail?.address_detail;

    const bl: DetailsField[] = [
      {
        type: 'text',
        name: 'address',
        label: t`Shipping Address`,
        icon: 'address',
        value_formatter: () =>
          address ? (
            <RenderAddress
              instance={
                shipment.shipment_address_detail ||
                shipment.order_detail?.address_detail
              }
            />
          ) : (
            <Text size='sm' c='red'>{t`Not specified`}</Text>
          )
      }
    ];

    const br: DetailsField[] = [
      {
        type: 'text',
        name: 'allocated_items',
        icon: 'packages',
        label: t`Allocated Items`
      },
      {
        type: 'text',
        name: 'return_orders_count',
        icon: 'return',
        label: t`Return Orders`
      },
      {
        type: 'text',
        name: 'checked_by',
        label: t`Checked By`,
        icon: 'check',
        value_formatter: () =>
          shipment.checked_by_detail ? (
            <RenderUser instance={shipment.checked_by_detail} />
          ) : (
            <Text size='sm' c='red'>{t`Not checked`}</Text>
          )
      },
      {
        type: 'text',
        name: 'shipment_date',
        label: t`Shipment Date`,
        icon: 'calendar',
        value_formatter: () => formatDate(shipment.shipment_date),
        hidden: !shipment.shipment_date
      },
      {
        type: 'text',
        name: 'delivery_date',
        label: t`Delivery Date`,
        icon: 'calendar',
        value_formatter: () => formatDate(shipment.delivery_date),
        hidden: !shipment.delivery_date
      }
    ];

    return (
      <>
        <ItemDetailsGrid>
          <Grid grow>
            <DetailsImage
              appRole={UserRoles.sales_order}
              apiPath={ApiEndpoints.company_list}
              src={customer?.image}
              pk={customer?.pk}
              imageActions={{
                selectExisting: false,
                downloadImage: false,
                uploadFile: false,
                deleteFile: false
              }}
            />
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <DetailsTable fields={tl} item={data} />
            </Grid.Col>
          </Grid>
          <DetailsTable fields={tr} item={data} />
          <DetailsTable fields={bl} item={data} />
          <DetailsTable fields={br} item={data} />
        </ItemDetailsGrid>
      </>
    );
  }, [shipment, shipmentQuery, customer, customerQuery]);

  const shipmentPanels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'detail',
        label: t`Shipment Details`,
        icon: <IconInfoCircle />,
        content: detailsPanel
      },
      {
        name: 'breakdown',
        label: t`Delivery Breakdown`,
        icon: <IconTruckDelivery />,
        content: (
          <ShipmentDeliveryBreakdown
            shipmentId={Number(id)}
            isPending={isPending}
            isClosed={shipment.metadata?.closed === true}
            onAllocationsChange={(total, unassigned) => {
              setTotalQty(total);
              setUnassignedQty(unassigned);
            }}
          />
        )
      },
      {
        name: 'history',
        label: t`Shipment History`,
        icon: <IconHistory />,
        content: (
          <ShipmentHistoryTable shipmentId={Number(id)} />
        )
      },
      {
        name: 'items',
        label: t`Allocated Stock`,
        icon: <IconBookmark />,
        content: (
          <SalesOrderAllocationTable
            orderId={shipment.order}
            shipmentId={shipment.pk}
            showPartInfo
            allowEdit={isPending}
            modelField='item'
            modelTarget={ModelType.stockitem}
          />
        )
      },

      ParametersPanel({
        model_type: ModelType.salesordershipment,
        model_id: shipment.pk
      }),
      AttachmentPanel({
        model_type: ModelType.salesordershipment,
        model_id: shipment.pk
      }),
      NotesPanel({
        model_type: ModelType.salesordershipment,
        model_id: shipment.pk,
        has_note: !!shipment.notes
      })
    ];
  }, [isPending, shipment, detailsPanel, id]);

  const editShipmentFields = useSalesOrderShipmentFields({
    pending: isPending,
    customerId: shipment.order_detail?.customer
  });

  const editShipment = useEditApiFormModal({
    url: ApiEndpoints.sales_order_shipment_list,
    pk: shipment.pk,
    fields: editShipmentFields,
    title: t`Edit Shipment`,
    onFormSuccess: refreshShipment
  });

  const deleteShipment = useDeleteApiFormModal({
    url: ApiEndpoints.sales_order_shipment_list,
    pk: shipment.pk,
    title: t`Cancel Shipment`,
    onFormSuccess: () => {
      // Shipment has been deleted - navigate back to the sales order
      navigate(getDetailUrl(ModelType.salesorder, shipment.order));
    }
  });

  const completeShipment = useCompleteShipmentForm({
    shipment: shipment,
    onSuccess: refreshShipment
  });

  const checkShipment = useCheckShipmentForm({
    shipmentId: shipment.pk,
    onSuccess: refreshShipment
  });

  const uncheckShipment = useUncheckShipmentForm({
    shipmentId: shipment.pk,
    onSuccess: refreshShipment
  });

  const shipmentBadges = useMemo(() => {
    return [];
  }, []);

  const shipmentActions = useMemo(() => {
    const canEdit: boolean = user.hasChangePermission(
      ModelType.salesordershipment
    );

    return [
      <AdminButton model={ModelType.salesordershipment} id={shipment.pk} />,
      <BarcodeActionDropdown
        key='barcode'
        model={ModelType.salesordershipment}
        pk={shipment.pk}
        hash={shipment?.barcode_hash}
      />,
      <PrintingActions
        key='print'
        modelType={ModelType.salesordershipment}
        items={[shipment.pk]}
        enableLabels
        enableReports
      />,
      <OptionsActionDropdown
        key='actions'
        tooltip={t`Shipment Actions`}
        actions={[
          EditItemAction({
            hidden: !canEdit || shipment.metadata?.closed === true,
            onClick: editShipment.open,
            tooltip: t`Edit Shipment`
          }),
          {
            hidden: isPending || shipment.metadata?.closed === true || !canEdit,
            name: t`Submit & Close Shipment`,
            tooltip: t`Submit and close the shipment (finalize all quantities)`,
            icon: <IconCheck color='green' />,
            onClick: handleCloseShipment
          },
          {
            hidden: !isPending || isChecked,
            name: t`Check`,
            tooltip: t`Mark shipment as checked`,
            icon: <IconCircleCheck color='green' />,
            onClick: checkShipment.open
          },
          {
            hidden: !isPending || !isChecked,
            name: t`Uncheck`,
            tooltip: t`Mark shipment as unchecked`,
            icon: <IconCircleX color='red' />,
            onClick: uncheckShipment.open
          },
          CancelItemAction({
            hidden: !isPending,
            onClick: deleteShipment.open,
            tooltip: t`Cancel Shipment`
          })
        ]}
      />
    ];
  }, [isChecked, isPending, user, shipment, totalQty, unassignedQty]);

  return (
    <>
      {completeShipment.modal}
      {editShipment.modal}
      {deleteShipment.modal}
      {checkShipment.modal}
      {uncheckShipment.modal}
      <InstanceDetail
        query={shipmentQuery}
        requiredRole={UserRoles.sales_order}
      >
        <Stack gap='xs'>
          <PageDetail
            title={`${t`Sales Order Shipment`}: ${shipment.reference}`}
            subtitle={`${t`Sales Order`}: ${shipment.order_detail?.reference}`}
            breadcrumbs={[
              { name: t`Sales`, url: '/sales/' },
              {
                name: shipment.order_detail?.reference,
                url: getDetailUrl(ModelType.salesorder, shipment.order)
              }
            ]}
            badges={shipmentBadges}
            imageUrl={customer?.image}
            editAction={editShipment.open}
            editEnabled={user.hasChangePermission(ModelType.salesordershipment) && shipment.metadata?.closed !== true}
            actions={shipmentActions}
          />
          <PanelGroup
            pageKey='salesordershipment'
            panels={shipmentPanels}
            model={ModelType.salesordershipment}
            reloadInstance={refreshShipment}
            instance={shipment}
            id={shipment.pk}
          />
        </Stack>
      </InstanceDetail>
    </>
  );
}
