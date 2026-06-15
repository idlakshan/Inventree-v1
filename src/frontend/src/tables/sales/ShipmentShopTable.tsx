import { t } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';
import { IconCircleX, IconBuildingStore } from '@tabler/icons-react';

import { AddItemButton } from '@lib/components/AddItemButton';
import {
  type RowAction,
  RowEditAction
} from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import useTable from '@lib/hooks/UseTable';
import type { TableColumn } from '@lib/types/Tables';
import { useShipmentShopFields } from '../../forms/SalesOrderForms';
import {
  useCreateApiFormModal,
  useDeleteApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { useUserState } from '../../states/UserState';
import { InvenTreeTable } from '../InvenTreeTable';

export default function ShipmentShopTable({
  shipmentId,
  allowEdit = true
}: Readonly<{
  shipmentId: number;
  allowEdit?: boolean;
}>) {
  const user = useUserState();
  const table = useTable('shipment-shop-table');

  const [selectedShop, setSelectedShop] = useState<any>({});

  const newShopFields = useShipmentShopFields({
    shipmentId: shipmentId,
    isEdit: false
  });

  const editShopFields = useShipmentShopFields({
    shipmentId: shipmentId,
    isEdit: true
  });

  const newShop = useCreateApiFormModal({
    url: ApiEndpoints.sales_order_shipment_shop_list,
    fields: newShopFields,
    title: t`Add Delivery Shop`,
    successMessage: t`Shop added to shipment`,
    table: table,
    initialData: {
      shipment: shipmentId
    }
  });

  const editShop = useEditApiFormModal({
    url: ApiEndpoints.sales_order_shipment_shop_list,
    pk: selectedShop.pk,
    fields: editShopFields,
    title: t`Edit Delivery Shop`,
    table: table
  });

  const deleteShop = useDeleteApiFormModal({
    url: ApiEndpoints.sales_order_shipment_shop_list,
    pk: selectedShop.pk,
    title: t`Remove Delivery Shop`,
    table: table
  });

  const tableColumns: TableColumn[] = useMemo(() => {
    return [
      {
        accessor: 'name',
        title: t`Shop Name`,
        sortable: true,
        switchable: false,
        render: (record: any) => (
          <span style={{ fontWeight: 600 }}>{record.name}</span>
        )
      },
      {
        accessor: 'address',
        title: t`Address`,
        sortable: false,
        switchable: true
      },
      {
        accessor: 'contact_name',
        title: t`Contact Person`,
        sortable: true,
        switchable: true
      },
      {
        accessor: 'contact_phone',
        title: t`Contact Phone`,
        sortable: false,
        switchable: true
      },
      {
        accessor: 'notes',
        title: t`Notes`,
        sortable: false,
        switchable: true
      }
    ];
  }, []);

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      return [
        RowEditAction({
          hidden: !allowEdit || !user.hasChangeRole(UserRoles.sales_order),
          tooltip: t`Edit shop details`,
          onClick: () => {
            setSelectedShop(record);
            editShop.open();
          }
        }),
        {
          title: t`Remove`,
          tooltip: t`Remove shop from shipment`,
          icon: <IconCircleX />,
          color: 'red',
          hidden: !allowEdit || !user.hasDeleteRole(UserRoles.sales_order),
          onClick: () => {
            setSelectedShop(record);
            deleteShop.open();
          }
        }
      ];
    },
    [allowEdit, user, editShop, deleteShop]
  );

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-shop'
        tooltip={t`Add delivery shop`}
        hidden={!allowEdit || !user.hasAddRole(UserRoles.sales_order)}
        onClick={() => {
          newShop.open();
        }}
      />
    ];
  }, [allowEdit, user, newShop]);

  return (
    <>
      {newShop.modal}
      {editShop.modal}
      {deleteShop.modal}
      <InvenTreeTable
        url={apiUrl(ApiEndpoints.sales_order_shipment_shop_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          tableActions: tableActions,
          enableSelection: false,
          enableSearch: true,
          enableFilters: false,
          rowActions: rowActions,
          params: {
            shipment: shipmentId
          }
        }}
      />
    </>
  );
}
