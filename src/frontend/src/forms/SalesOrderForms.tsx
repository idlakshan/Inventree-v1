import { t } from '@lingui/core/macro';
import { Alert, Table, Text } from '@mantine/core';
import {
  IconAddressBook,
  IconCalendar,
  IconCircleCheck,
  IconCircleX,
  IconCoins,
  IconUser,
  IconUsers
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../App';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import RemoveRowButton from '../components/buttons/RemoveRowButton';
import { StandaloneField } from '../components/forms/StandaloneField';

import { ProgressBar } from '@lib/components/ProgressBar';
import { apiUrl } from '@lib/functions/Api';
import { toNumber } from '@lib/functions/Conversion';
import type {
  ApiFormAdjustFilterType,
  ApiFormFieldSet,
  ApiFormFieldType
} from '@lib/types/Forms';
import dayjs from 'dayjs';
import type { TableFieldRowProps } from '../components/forms/fields/TableField';
import useBackgroundTask from '../hooks/UseBackgroundTask';
import { useCreateApiFormModal, useEditApiFormModal } from '../hooks/UseForm';
import { useGlobalSettingsState } from '../states/SettingsStates';
import { useUserState } from '../states/UserState';
import { RenderPartColumn } from '../tables/ColumnRenderers';

export function useSalesOrderFields({
  duplicateOrderId
}: {
  duplicateOrderId?: number;
}): ApiFormFieldSet {
  const globalSettings = useGlobalSettingsState();

  return useMemo(() => {
    const fields: ApiFormFieldSet = {
      reference: {},
      description: {},
      customer: {
        disabled: duplicateOrderId != undefined,
        filters: {
          is_customer: true,
          active: true
        },
        addCreateFields: {
          name: {},
          description: {},
          is_customer: { value: true, hidden: true }
        }
      },
      customer_reference: {},
      project_code: {},
      order_currency: {},
      start_date: {
        icon: <IconCalendar />
      },
      target_date: {
        icon: <IconCalendar />
      },
      link: {},
      contact: {
        icon: <IconUser />,
        adjustFilters: (value: ApiFormAdjustFilterType) => {
          return {
            ...value.filters,
            company: value.data.customer
          };
        }
      },
      address: {
        icon: <IconAddressBook />,
        adjustFilters: (value: ApiFormAdjustFilterType) => {
          return {
            ...value.filters,
            company: value.data.customer
          };
        }
      },
      responsible: {
        icon: <IconUsers />
      }
    };

    // Order duplication fields
    if (!!duplicateOrderId) {
      fields.duplicate = {
        children: {
          order_id: {
            hidden: true,
            value: duplicateOrderId
          },
          copy_lines: {},
          copy_extra_lines: {},
          copy_parameters: {}
        }
      };
    }

    if (!globalSettings.isSet('PROJECT_CODES_ENABLED', true)) {
      delete fields.project_code;
    }

    return fields;
  }, [duplicateOrderId, globalSettings]);
}

export function useSalesOrderLineItemFields({
  customerId,
  orderId,
  create,
  currency,
  initialQuantity
}: {
  customerId?: number;
  orderId?: number;
  create?: boolean;
  currency?: string;
  initialQuantity?: number;
}): ApiFormFieldSet {
  const [salePrice, setSalePrice] = useState<string | undefined>(undefined);
  const [partCurrency, setPartCurrency] = useState<string>(currency ?? '');
  const [part, setPart] = useState<any>({});
  const [quantity, setQuantity] = useState<number>(initialQuantity ?? 1);
  const [packagedQuantityInput, setPackagedQuantityInput] = useState<string>('');

  // Helper: compute cases/bottles string from a total quantity
  const computeCasesBottles = (qty: number | null, pkg: number): string => {
    if (!qty || qty <= 0) return '';
    if (pkg <= 1) return `${qty}`;
    const cases = Math.floor(qty / pkg);
    const bottles = qty % pkg;
    return `${cases}/${bottles}`;
  };

  // Update Cases/Bottles when part changes
  useEffect(() => {
    const pkg = part?.packaging ?? part?.part_detail?.packaging ?? 1;
    if (quantity !== null && quantity !== undefined) {
      setPackagedQuantityInput(computeCasesBottles(quantity, pkg));
    } else {
      setPackagedQuantityInput('');
    }
  }, [part]);

  useEffect(() => {
    if (initialQuantity !== undefined) {
      setQuantity(initialQuantity);
      const pkg = part?.packaging ?? part?.part_detail?.packaging ?? 1;
      setPackagedQuantityInput(computeCasesBottles(initialQuantity, pkg));
    }
  }, [initialQuantity, part]);

  // Update suggested sale price when part, quantity, or part currency changes
  useEffect(() => {
    // Only attempt to set sale price for new line items
    if (!create) return;

    const qty = toNumber(quantity, null);

    if (qty == null || qty <= 0) {
      setSalePrice(undefined);
      return;
    }

    if (!part || !part.price_breaks || part.price_breaks.length === 0) {
      setSalePrice(undefined);
      return;
    }

    const applicablePriceBreaks = part?.price_breaks
      ?.filter(
        (pb: any) => pb.price_currency == partCurrency && qty >= pb.quantity
      )
      .sort((a: any, b: any) => b.quantity - a.quantity);

    if (applicablePriceBreaks.length) {
      setSalePrice(applicablePriceBreaks[0].price);
    } else {
      setSalePrice(undefined);
    }
  }, [part, quantity, partCurrency, create]);

  return useMemo(() => {
    const fields: ApiFormFieldSet = {
      order: {
        filters: {
          customer_detail: true
        },
        disabled: true,
        value: create ? orderId : undefined
      },
      part: {
        filters: {
          active: true,
          salable: true,
          price_breaks: true,
          part_detail: true
        },
        onValueChange: (_: any, record?: any) => {
          setPart(record);

          const pkg = record?.packaging ?? record?.part_detail?.packaging ?? 1;
          if (packagedQuantityInput) {
            let total = 0;
            if (packagedQuantityInput.includes('/')) {
              const [casePart, bottlePart] = packagedQuantityInput.split('/');
              const cases = parseInt(casePart) || 0;
              const bottles = parseInt(bottlePart) || 0;
              total = cases * pkg + bottles;
            } else {
              const cases = parseInt(packagedQuantityInput) || 0;
              total = cases * pkg;
            }
            setQuantity(total);
          } else {
            setPackagedQuantityInput(computeCasesBottles(quantity, pkg));
          }
        }
      },
      line: {},
      reference: {},
      packaged_quantity: {
        exclude: true,
        field_type: 'string',
        label: t`Cases & Bottles`,
        value: packagedQuantityInput,
        description: (part?.packaging ?? part?.part_detail?.packaging ?? 1) > 1
          ? t`Enter cases and bottles separated by / (e.g. 4/5 = 4 cases + 5 bottles)`
          : t`Enter quantity`,
        placeholder: (part?.packaging ?? part?.part_detail?.packaging ?? 1) > 1 ? t`e.g. 4/5` : t`e.g. 10`,
        onValueChange: (value) => {
          const valStr = (value ?? '').toString().trim();
          setPackagedQuantityInput(valStr);
          if (!valStr) {
            setQuantity(0);
            return;
          }

          const pkg = part?.packaging ?? part?.part_detail?.packaging ?? 1;
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
          setQuantity(total);
        }
      },
      quantity: {
        value: quantity,
        onValueChange: (value) => {
          const newQty = value !== null && value !== undefined ? Number(value) : 0;
          setQuantity(newQty);
          const pkg = part?.packaging ?? part?.part_detail?.packaging ?? 1;
          setPackagedQuantityInput(computeCasesBottles(newQty, pkg));
        }
      },
      sale_price: {
        placeholder: salePrice,
        placeholderAutofill: true,
        placeholderWarningCompare: salePrice,
        placeholderWarning: t`Price based on stock item and quantity differs${salePrice ? `; suggested: (${salePrice})` : '.'}`
      },
      sale_price_currency: {
        icon: <IconCoins />,
        value: partCurrency,
        onValueChange: setPartCurrency
      },
      project_code: {
        description: t`Select project code for this line item`
      },
      target_date: {},
      notes: {},
      link: {}
    };

    return fields;
  }, [
    salePrice,
    partCurrency,
    orderId,
    create,
    quantity,
    part,
    packagedQuantityInput
  ]);
}

export function useCheckShipmentForm({
  shipmentId,
  onSuccess
}: {
  shipmentId: number;
  onSuccess: (response: any) => void;
}) {
  const user = useUserState();

  return useEditApiFormModal({
    url: ApiEndpoints.sales_order_shipment_list,
    pk: shipmentId,
    title: t`Check Shipment`,
    preFormContent: (
      <Alert color='green' icon={<IconCircleCheck />} title={t`Check Shipment`}>
        <Text>{t`Marking the shipment as checked indicates that you have verified that all items included in this shipment are correct`}</Text>
      </Alert>
    ),
    fetchInitialData: false,
    fields: {
      checked_by: {
        hidden: true,
        value: user.getUser()?.pk
      }
    },
    successMessage: t`Shipment marked as checked`,
    onFormSuccess: onSuccess
  });
}

export function useUncheckShipmentForm({
  shipmentId,
  onSuccess
}: {
  shipmentId: number;
  onSuccess: (response: any) => void;
}) {
  return useEditApiFormModal({
    url: ApiEndpoints.sales_order_shipment_list,
    pk: shipmentId,
    title: t`Uncheck Shipment`,
    preFormContent: (
      <Alert color='red' icon={<IconCircleX />} title={t`Uncheck Shipment`}>
        <Text>{t`Marking the shipment as unchecked indicates that the shipment requires further verification`}</Text>
      </Alert>
    ),
    fetchInitialData: false,
    fields: {
      checked_by: {
        hidden: true,
        value: null
      }
    },
    successMessage: t`Shipment marked as unchecked`,
    onFormSuccess: onSuccess
  });
}

export function useCompleteShipmentForm({
  shipment,
  onSuccess
}: {
  shipment: any;
  onSuccess: () => void;
}) {
  const [taskId, setTaskId] = useState<string>('');

  const completeShipmentFields = useSalesOrderShipmentCompleteFields({});

  useBackgroundTask({
    taskId: taskId,
    message: t`Completing shipment`,
    successMessage: t`Shipment completed successfully`,
    onSuccess: onSuccess
  });

  return useCreateApiFormModal({
    url: ApiEndpoints.sales_order_shipment_complete,
    pk: shipment.pk,
    title: t`Complete Shipment`,
    fields: completeShipmentFields,
    focus: 'tracking_number',
    initialData: {
      ...shipment,
      shipment_date: dayjs().format('YYYY-MM-DD')
    },
    successMessage: null,
    onFormSuccess: (response: any) => {
      if (response.task_id) {
        setTaskId(response.task_id);
      } else {
        onSuccess();
      }
    }
  });
}

function SalesOrderAllocateLineRow({
  props,
  record,
  sourceLocation
}: Readonly<{
  props: TableFieldRowProps;
  record: any;
  sourceLocation?: number | null;
}>) {
  const [selectedStockItem, setSelectedStockItem] = useState<any>(null);

  const pkg = record.part_detail?.packaging || 1;

  // Helper: compute cases/bottles string from a total quantity
  const computeCasesBottles = (qty: number | null, pkg: number): string => {
    if (!qty || qty <= 0) return '';
    if (pkg <= 1) return `${qty}`;
    const cases = Math.floor(qty / pkg);
    const bottles = qty % pkg;
    return `${cases}/${bottles}`;
  };

  const [casesBottlesValue, setCasesBottlesValue] = useState<string>(() => {
    return computeCasesBottles(props.item.quantity, pkg);
  });

  const maxAllowed = useMemo(() => {
    const remainingLineRequired = Math.max(0, record.quantity - record.allocated);
    if (selectedStockItem) {
      const availableStock = Math.max(0, selectedStockItem.quantity - selectedStockItem.allocated);
      return Math.min(remainingLineRequired, availableStock);
    }
    return remainingLineRequired;
  }, [selectedStockItem, record]);

  // Statically defined field for selecting the stock item
  const stockItemField: ApiFormFieldType = useMemo(() => {
    return {
      field_type: 'related field',
      api_url: apiUrl(ApiEndpoints.stock_item_list),
      model: ModelType.stockitem,
      autoFill: true,
      filters: {
        available: true,
        part_detail: true,
        location_detail: true,
        location: sourceLocation,
        cascade: sourceLocation ? true : undefined,
        part: record.part
      },
      value: props.item.stock_item,
      name: 'stock_item',
      onValueChange: (value: any, instance: any) => {
        props.changeFn(props.idx, 'stock_item', value);
        setSelectedStockItem(instance || null);

        // Update the allocated quantity based on the selected stock item
        if (instance) {
          const available = instance.quantity - instance.allocated;
          const required = record.quantity - record.allocated;

          let quantity = props.item?.quantity ?? 0;

          quantity = Math.max(quantity, required);
          quantity = Math.min(quantity, available);

          if (quantity != props.item.quantity) {
            props.changeFn(props.idx, 'quantity', quantity);
            setCasesBottlesValue(computeCasesBottles(quantity, pkg));
          }
        }
      }
    };
  }, [sourceLocation, record, props, pkg]);

  // Statically defined field for selecting the cases/bottles input
  const casesBottlesField: ApiFormFieldType = useMemo(() => {
    return {
      field_type: 'string',
      name: 'packaged_quantity',
      value: casesBottlesValue,
      disabled: pkg <= 1,
      onValueChange: (value: any) => {
        const valStr = (value ?? '').toString().trim();
        setCasesBottlesValue(valStr);

        if (!valStr) {
          props.changeFn(props.idx, 'quantity', 0);
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

        if (total > maxAllowed) {
          total = maxAllowed;
          setCasesBottlesValue(computeCasesBottles(total, pkg));
        }

        props.changeFn(props.idx, 'quantity', total);
      }
    };
  }, [casesBottlesValue, pkg, props, maxAllowed]);

  // Statically defined field for selecting the allocation quantity
  const quantityField: ApiFormFieldType = useMemo(() => {
    return {
      field_type: 'number',
      name: 'quantity',
      required: true,
      value: props.item.quantity,
      min: 0,
      max: maxAllowed,
      onValueChange: (value: any) => {
        let qtyVal = value !== null && value !== undefined ? Number(value) : 0;
        if (qtyVal > maxAllowed) {
          qtyVal = maxAllowed;
        }
        props.changeFn(props.idx, 'quantity', qtyVal);
        setCasesBottlesValue(computeCasesBottles(qtyVal, pkg));
      }
    } as any;
  }, [props, maxAllowed, pkg]);

  return (
    <Table.Tr key={`table-row-${props.idx}-${record.pk}`}>
      <Table.Td>
        <RenderPartColumn part={record.part_detail} />
      </Table.Td>
      <Table.Td>
        <ProgressBar
          value={record.allocated}
          maximum={record.quantity}
          progressLabel
        />
      </Table.Td>
      <Table.Td>
        <StandaloneField
          fieldName='stock_item'
          fieldDefinition={stockItemField}
          error={props.rowErrors?.stock_item?.message}
        />
      </Table.Td>
      <Table.Td>
        <StandaloneField
          fieldName='packaged_quantity'
          fieldDefinition={casesBottlesField}
          error={props.rowErrors?.packaged_quantity?.message}
        />
      </Table.Td>
      <Table.Td>
        <StandaloneField
          fieldName='quantity'
          fieldDefinition={quantityField}
          error={props.rowErrors?.quantity?.message}
        />
      </Table.Td>
      <Table.Td>
        <RemoveRowButton onClick={() => props.removeFn(props.idx)} />
      </Table.Td>
    </Table.Tr>
  );
}

export function useAllocateToSalesOrderForm({
  orderId,
  shipmentId,
  lineItems,
  onFormSuccess
}: {
  orderId: number;
  shipmentId?: number;
  lineItems: any[];
  onFormSuccess: (response: any) => void;
}) {
  const [sourceLocation, setSourceLocation] = useState<number | null>(null);

  // Reset source location to known state
  useEffect(() => {
    setSourceLocation(null);
  }, [orderId, shipmentId, lineItems]);

  const fields: ApiFormFieldSet = useMemo(() => {
    return {
      // Non-submitted field to select the source location
      source_location: {
        exclude: true,
        required: false,
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.stock_location_list),
        model: ModelType.stocklocation,
        label: t`Source Location`,
        description: t`Select the source location for the stock allocation`,
        onValueChange: (value: any) => {
          setSourceLocation(value);
        }
      },
      items: {
        field_type: 'table',
        value: [],
        headers: [
          { title: t`Stock Item`, style: { width: '35%', minWidth: '200px' } },
          { title: t`Allocated`, style: { width: '100px', minWidth: '80px' } },
          { title: t`Stock Item`, style: { width: '25%', minWidth: '200px' } },
          { title: t`Cases & Bottles`, style: { width: '15%', minWidth: '130px' } },
          { title: t`Quantity`, style: { width: '10%', minWidth: '90px' } },
          { title: '', style: { width: '50px' } }
        ],
        modelRenderer: (row: TableFieldRowProps) => {
          const record =
            lineItems.find((item) => item.pk == row.item.line_item) ?? {};

          return (
            <SalesOrderAllocateLineRow
              key={`table-row-${row.idx}-${record.pk}`}
              props={row}
              record={record}
              sourceLocation={sourceLocation}
            />
          );
        }
      },
      shipment: {
        autoFill: true,
        filters: {
          shipped: false,
          order_detail: true,
          order: orderId
        }
      }
    };
  }, [orderId, shipmentId, lineItems, sourceLocation]);

  return useCreateApiFormModal({
    title: t`Allocate Stock`,
    url: ApiEndpoints.sales_order_allocate,
    pk: orderId,
    fields: fields,
    onFormSuccess: onFormSuccess,
    successMessage: t`Stock items allocated`,
    size: '80%',
    keepOpenOption: true,
    initialData: {
      items: lineItems.map((item) => {
        return {
          line_item: item.pk,
          quantity: 0,
          stock_item: null
        };
      })
    }
  });
}

export function useSalesOrderAllocateSerialsFields({
  itemId,
  orderId
}: {
  itemId: number;
  orderId: number;
}): ApiFormFieldSet {
  return useMemo(() => {
    return {
      line_item: {
        value: itemId,
        hidden: true
      },
      quantity: {},
      serial_numbers: {},
      shipment: {
        filters: {
          order_detail: true,
          order: orderId,
          shipped: false
        }
      }
    };
  }, [itemId, orderId]);
}

export function useSalesOrderShipmentFields({
  customerId,
  pending
}: {
  customerId?: number;
  pending?: boolean;
}): ApiFormFieldSet {
  return useMemo(() => {
    return {
      order: {
        disabled: true
      },
      reference: {},
      shipment_date: {
        hidden: pending ?? true
      },
      delivery_date: {
        hidden: pending ?? true
      },
      shipment_address: {
        placeholder: t`Leave blank to use the order address`,
        filters: {
          company: customerId,
          ordering: '-primary'
        }
      },
      tracking_number: {},
      invoice_number: {},
      link: {}
    };
  }, [customerId, pending]);
}

export function useSalesOrderShipmentCompleteFields({
  shipmentId
}: {
  shipmentId?: number;
}): ApiFormFieldSet {
  return useMemo(() => {
    return {
      shipment_date: {},
      tracking_number: {},
      invoice_number: {},
      link: {}
    };
  }, [shipmentId]);
}

export function useShipmentShopFields({
  shipmentId,
  isEdit
}: {
  shipmentId?: number;
  isEdit?: boolean;
}): ApiFormFieldSet {
  const [allShops, setAllShops] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<any>(null);

  useEffect(() => {
    if (isEdit) return;

    api.get(apiUrl(ApiEndpoints.sales_order_shipment_shop_list))
      .then((response) => {
        if (response.data && Array.isArray(response.data)) {
          // Keep only unique shops by name
          const uniqueShops: any[] = [];
          const seenNames = new Set<string>();
          for (const shop of response.data) {
            const nameLower = (shop.name || '').trim().toLowerCase();
            if (nameLower && !seenNames.has(nameLower)) {
              seenNames.add(nameLower);
              uniqueShops.push(shop);
            }
          }
          setAllShops(uniqueShops);
        }
      })
      .catch((err) => {
        console.error('Error fetching shops:', err);
      });
  }, [isEdit]);

  return useMemo(() => {
    const fields: ApiFormFieldSet = {};

    if (!isEdit) {
      fields.existing_shop = {
        field_type: 'choice',
        label: t`Copy from Existing Shop`,
        description: t`Optional: Select an existing shop to auto-fill details`,
        required: false,
        exclude: true,
        choices: allShops.map((shop) => ({
          value: shop.pk.toString(),
          display_name: `${shop.name} (${shop.address || 'No Address'})`
        })),
        onValueChange: (val: any) => {
          if (!val) {
            setSelectedShop(null);
            return;
          }
          const found = allShops.find((s) => s.pk.toString() === val.toString());
          if (found) {
            setSelectedShop(found);
          }
        }
      };
    }

    fields.shipment = {
      value: shipmentId,
      hidden: true
    };
    fields.name = {
      value: selectedShop ? selectedShop.name : undefined
    };
    fields.address = {
      value: selectedShop ? selectedShop.address : undefined
    };
    fields.contact_name = {
      value: selectedShop ? selectedShop.contact_name : undefined
    };
    fields.contact_phone = {
      value: selectedShop ? selectedShop.contact_phone : undefined
    };
    fields.notes = {
      value: selectedShop ? selectedShop.notes : undefined
    };

    return fields;
  }, [shipmentId, isEdit, allShops, selectedShop]);
}

export function useSalesOrderAllocationFields({
  orderId,
  shipment,
  shipmentId
}: {
  orderId?: number;
  shipment?: any;
  shipmentId?: number;
}): ApiFormFieldSet {
  return useMemo(() => {
    const finalShipmentId = shipmentId || shipment?.pk;
    return {
      item: {
        // Cannot change item, but display for reference
        disabled: true
      },
      quantity: {},
      shipment: {
        // Cannot change shipment once it has been shipped
        disabled: !!shipment?.shipment_date,
        // Order ID is required for this field to be accessed
        hidden: !orderId,
        filters: {
          order: orderId,
          shipped: false
        }
      },
      shop: {
        hidden: !finalShipmentId,
        filters: {
          shipment: finalShipmentId
        }
      }
    };
  }, [orderId, shipment, shipmentId]);
}

export function useSalesOrderAllocationReturnQtyFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      sales_qty: {
        field_type: 'integer',
        label: t`Sales Quantity`,
        description: t`Specify the actual quantity sold/delivered`,
        required: true
      },
      actual_returned_qty: {
        field_type: 'integer',
        label: t`Returned Quantity`,
        description: t`Specify the quantity physically returned by the shop`,
        required: true
      },
      return_location: {
        field_type: 'related field',
        label: t`Return Location`,
        description: t`Select the warehouse location to return items to`,
        model: ModelType.stocklocation,
        api_url: apiUrl(ApiEndpoints.stock_location_list),
        required: false
      },
      return_status: {
        field_type: 'choice',
        label: t`Returned Stock Status`,
        description: t`Select the stock status for the returned items`,
        required: false,
        choices: [
          { value: 10, display_name: t`OK` },
          { value: 50, display_name: t`Attention needed` },
          { value: 55, display_name: t`Damaged` },
          { value: 60, display_name: t`Destroyed` },
          { value: 65, display_name: t`Rejected` },
          { value: 70, display_name: t`Lost` },
          { value: 75, display_name: t`Quarantined` },
          { value: 85, display_name: t`Returned` }
        ],
        value: 85
      }
    };
  }, []);
}
