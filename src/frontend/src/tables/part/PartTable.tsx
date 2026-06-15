import {
  type RowAction,
  RowDuplicateAction,
  RowEditAction
} from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import useTable from '@lib/hooks/UseTable';
import type { ApiFormFieldSet } from '@lib/types/Forms';
import type { TableColumn } from '@lib/types/Tables';
import type { InvenTreeTableProps } from '@lib/types/Tables';
import { t } from '@lingui/core/macro';
import { Text } from '@mantine/core';
import {
  IconFileUpload,
  IconPackageImport,
  IconPlus,
  IconShoppingCart
} from '@tabler/icons-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { ActionDropdown } from '../../components/items/ActionDropdown';
import ImportPartWizard from '../../components/wizards/ImportPartWizard';
import OrderPartsWizard from '../../components/wizards/OrderPartsWizard';
import { formatDecimal, formatPriceRange } from '../../defaults/formatters';
import { dataImporterSessionFields } from '../../forms/ImporterForms';
import { usePartFields } from '../../forms/PartForms';
import { InvenTreeIcon } from '../../functions/icons';
import {
  useBulkEditApiFormModal,
  useCreateApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { usePluginsWithMixin } from '../../hooks/UsePlugins';
import { useImporterState } from '../../states/ImporterState';
import { useGlobalSettingsState } from '../../states/SettingsStates';
import { useUserState } from '../../states/UserState';
import {
  CategoryColumn,
  DefaultLocationColumn,
  DescriptionColumn,
  IPNColumn,
  LinkColumn,
  PartColumn
} from '../ColumnRenderers';
import { InvenTreeTable } from '../InvenTreeTable';
import { TableHoverCard } from '../TableHoverCard';
import { PartTableFilters } from './PartTableFilters';

function formatCaseBottleQuantity(
  quantity: number,
  packaging?: number,
  units?: string
): string {
  if (!packaging || packaging <= 0) {
    const formatted = formatDecimal(quantity);
    return units ? `${formatted} ${units}` : String(formatted);
  }

  const cases = Math.floor(quantity / packaging);
  const looseBottles = quantity % packaging;
  const totalBottles = quantity;

  const unitName = units || 'Bottles';

  if (looseBottles > 0) {
    return `${cases} Cases, ${looseBottles} ${unitName} (${formatDecimal(totalBottles)} Total ${unitName})`;
  }

  return `${cases} Cases (${formatDecimal(totalBottles)} ${unitName})`;
}

/**
 * Construct a list of columns for the part table
 */
function partTableColumns(): TableColumn[] {
  return [
    PartColumn({
      part: '',
      accessor: 'name'
    }),
    IPNColumn({
      accessor: 'IPN'
    }),
    {
      accessor: 'revision',
      sortable: true
    },
    {
      accessor: 'units',
      sortable: true,
      copyable: true
    },
    {
      accessor: 'packaging',
      title: t`Packaging/Case Size`,
      sortable: true,
    },
    DescriptionColumn({}),
    CategoryColumn({
      accessor: 'category_detail'
    }),
    DefaultLocationColumn({
      accessor: 'default_location_detail'
    }),
    {
      accessor: 'total_in_stock',
      title: t`Total Stock`,
      sortable: true,

      render: (record) => {
        if (record.virtual) {
          return (
            <Text size='sm' c='dimmed' fs='italic'>
              {t`Virtual stock item`}
            </Text>
          );
        }

        const extra: ReactNode[] = [];

        // actual qty = total physical stock in warehouse
        const actualQty = record?.total_in_stock ?? 0;
        // sales qty = allocated to open sales orders (not yet shipped)
        const salesQty = record?.allocated_to_sales_orders ?? 0;
        // available = actual - sales
        const available = Math.max(0, actualQty - salesQty);
        const min_stock = record?.minimum_stock ?? 0;

        let color: string | undefined = undefined;

        // Build tooltip details
        if (salesQty > 0) {
          extra.push(
            <Text key='total-stock'>
              {`${t`Total In Stock`}: ${formatCaseBottleQuantity(actualQty, record.packaging, record.units)}`}
            </Text>
          );
          extra.push(
            <Text key='so-allocations'>
              {`${t`Sales Order Allocations`}: ${formatCaseBottleQuantity(salesQty, record.packaging, record.units)}`}
            </Text>
          );
        }

        if (record.ordering > 0) {
          extra.push(
            <Text key='on-order'>{`${t`On Order`}: ${formatCaseBottleQuantity(record.ordering, record.packaging, record.units)}`}</Text>
          );
        }

        if (min_stock > 0 && available < min_stock) {
          extra.push(
            <Text key='min-stock' c='orange'>
              {`${t`Minimum stock`}: ${formatCaseBottleQuantity(min_stock, record.packaging, record.units)}`}
            </Text>
          );
          color = 'orange';
        }

        // Determine display text and color
        let text: string;
        if (actualQty <= 0) {
          // Truly no physical stock at all
          color = 'red';
          text = t`No stock`;
        } else {
          // Show: actual qty - sales qty
          text = formatCaseBottleQuantity(available, record.packaging, record.units);
        }

        return (
          <TableHoverCard
            value={
              <Text c={color}>{text}</Text>
            }
            title={t`Stock Information`}
            extra={extra}
          />
        );
      }
    },
    {
      accessor: 'price_range',
      title: t`Price Range`,
      sortable: true,
      ordering: 'pricing_max',
      defaultVisible: false,
      render: (record: any) =>
        formatPriceRange(record.pricing_min, record.pricing_max)
    },
    LinkColumn({})
  ];
}

/**
 * PartListTable - Displays a list of parts, based on the provided parameters
 * @param {Object} params - The query parameters to pass to the API
 * @returns
 */
export function PartListTable({
  enableImport = true,
  basePartInstance,
  props,
  tableName = 'part-list',
  defaultPartData
}: Readonly<{
  enableImport?: boolean;
  props?: InvenTreeTableProps;
  basePartInstance?: any;
  tableName?: string;
  defaultPartData?: any;
}>) {
  const tableColumns = useMemo(() => partTableColumns(), []);

  const tableFilters = useMemo(() => PartTableFilters(), []);

  const table = useTable(tableName ?? 'part-list', {
    initialFilters: [
      {
        name: 'active',
        value: 'true'
      }
    ]
  });
  const user = useUserState();
  const globalSettings = useGlobalSettingsState();
  const openImporter = useImporterState((state) => state.openImporter);

  const importSessionFields = useMemo(() => {
    const fields = dataImporterSessionFields({
      modelType: ModelType.part
    });

    // Override default field values with provided fields
    fields.field_defaults.value = {
      ...props?.params,
      ...defaultPartData
    };

    return fields;
  }, [defaultPartData, props?.params]);

  const importParts = useCreateApiFormModal({
    url: ApiEndpoints.import_session_list,
    title: t`Import Stock Items`,
    fields: importSessionFields,
    onFormSuccess: (response: any) => {
      openImporter(response.pk, {
        onClose: table.refreshTable
      });
    }
  });

  const initialPartData = useMemo(() => {
    return defaultPartData ?? props?.params ?? {};
  }, [defaultPartData, props?.params]);

  const newPartFields = usePartFields({
    create: true,
    duplicatePartInstance: basePartInstance
  });

  const newPart = useCreateApiFormModal({
    url: ApiEndpoints.part_list,
    title: t`Add Stock Item`,
    fields: newPartFields,
    initialData: initialPartData,
    follow: true,
    modelType: ModelType.part,
    keepOpenOption: true
  });

  const [selectedPart, setSelectedPart] = useState<any>({});

  const editPart = useEditApiFormModal({
    url: ApiEndpoints.part_list,
    pk: selectedPart.pk,
    title: t`Edit Stock Item`,
    fields: usePartFields({ create: false }),
    onFormSuccess: table.refreshTable
  });

  const createPartFields = usePartFields({ create: true });

  const duplicatePartFields: ApiFormFieldSet = useMemo(() => {
    return {
      ...createPartFields,
      duplicate: {
        children: {
          part: {
            value: selectedPart.pk,
            hidden: true
          },
          copy_image: {
            value: true
          },
          copy_bom: {
            value:
              selectedPart.assembly && globalSettings.isSet('PART_COPY_BOM'),
            hidden: !selectedPart.assembly
          },
          copy_notes: {
            value: true
          },
          copy_parameters: {
            value: globalSettings.isSet('PART_COPY_PARAMETERS')
          },
          copy_tests: {
            value: selectedPart.testable,
            hidden: !selectedPart.testable
          }
        }
      }
    };
  }, [createPartFields, globalSettings, selectedPart]);

  const duplicatePart = useCreateApiFormModal({
    url: ApiEndpoints.part_list,
    title: t`Add Stock Item`,
    fields: duplicatePartFields,
    initialData: {
      ...selectedPart,
      active: true,
      locked: false
    },
    follow: false,
    modelType: ModelType.part,
    onFormSuccess: table.refreshTable
  });

  const setCategory = useBulkEditApiFormModal({
    url: ApiEndpoints.part_list,
    items: table.selectedIds,
    title: t`Set Category`,
    fields: {
      category: {}
    },
    onFormSuccess: table.refreshTable
  });

  const orderPartsWizard = OrderPartsWizard({ parts: table.selectedRecords });

  const supplierPlugins = usePluginsWithMixin('supplier');
  const importPartWizard = ImportPartWizard({
    categoryId: initialPartData.category
  });

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      const can_edit = user.hasChangePermission(ModelType.part);
      const can_add = user.hasAddPermission(ModelType.part);

      return [
        RowEditAction({
          hidden: !can_edit,
          onClick: () => {
            setSelectedPart(record);
            editPart.open();
          }
        }),
        RowDuplicateAction({
          hidden: !can_add,
          onClick: () => {
            setSelectedPart(record);
            duplicatePart.open();
          }
        })
      ];
    },
    [user, editPart, duplicatePart]
  );

  const tableActions = useMemo(() => {
    return [
      <ActionDropdown
        tooltip={t`Stock Item Actions`}
        icon={<InvenTreeIcon icon='part' />}
        disabled={!table.hasSelectedRecords}
        position='bottom-start'
        actions={[
          {
            name: t`Set Category`,
            icon: <InvenTreeIcon icon='category' />,
            tooltip: t`Set category for selected stock items`,
            hidden: !user.hasChangeRole(UserRoles.part),
            disabled: !table.hasSelectedRecords,
            onClick: () => {
              setCategory.open();
            }
          },
          {
            name: t`Order Stock Items`,
            icon: <IconShoppingCart color='blue' />,
            tooltip: t`Order selected stock items`,
            hidden: !user.hasAddRole(UserRoles.purchase_order),
            onClick: () => {
              orderPartsWizard.openWizard();
            }
          }
        ]}
      />,
      <ActionDropdown
        key='add-parts-actions'
        tooltip={t`Add Stock Items`}
        position='bottom-start'
        icon={<IconPlus />}
        hidden={!user.hasAddRole(UserRoles.part)}
        actions={[
          {
            name: t`Create Stock Item`,
            icon: <IconPlus />,
            tooltip: t`Create a new stock item`,
            onClick: () => newPart.open()
          },
          {
            name: t`Import from File`,
            icon: <IconFileUpload />,
            tooltip: t`Import stock items from a file`,
            onClick: () => importParts.open(),
            hidden: !enableImport
          },
          {
            name: t`Import from Supplier`,
            icon: <IconPackageImport />,
            tooltip: t`Import stock items from a supplier plugin`,
            hidden: !enableImport || supplierPlugins.length === 0,
            onClick: () => importPartWizard.openWizard()
          }
        ]}
      />
    ];
  }, [user, enableImport, table.hasSelectedRecords, supplierPlugins]);

  return (
    <>
      {newPart.modal}
      {duplicatePart.modal}
      {editPart.modal}
      {setCategory.modal}
      {importParts.modal}
      {orderPartsWizard.wizard}
      {importPartWizard.wizard}
      <InvenTreeTable
        url={apiUrl(ApiEndpoints.part_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          ...props,
          enableDownload: true,
          modelType: ModelType.part,
          tableFilters: tableFilters,
          tableActions: tableActions,
          rowActions: rowActions,
          enableSelection: true,
          enableReports: true,
          enableLabels: true,
          params: {
            ...props?.params,
            category_detail: true,
            location_detail: true
          }
        }}
      />
    </>
  );
}
