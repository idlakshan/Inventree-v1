import type { TableFilter } from '@lib/types/Filters';
import { t } from '@lingui/core/macro';

/**
 * Construct a set of filters for the part table
 */
export function PartTableFilters(): TableFilter[] {
  return [
    {
      name: 'active',
      label: t`Active`,
      description: t`Filter by stock item active status`,
      type: 'boolean'
    },
    {
      name: 'locked',
      label: t`Locked`,
      description: t`Filter by stock item locked status`,
      type: 'boolean'
    },
    {
      name: 'assembly',
      label: t`Assembly`,
      description: t`Filter by assembly attribute`,
      type: 'boolean'
    },
    {
      name: 'bom_valid',
      label: t`BOM Valid`,
      description: t`Filter by stock items with a valid BOM`,
      type: 'boolean'
    },
    {
      name: 'cascade',
      label: t`Include Subcategories`,
      description: t`Include stock items in subcategories`,
      type: 'boolean'
    },
    {
      name: 'component',
      label: t`Component`,
      description: t`Filter by component attribute`,
      type: 'boolean'
    },
    {
      name: 'testable',
      label: t`Testable`,
      description: t`Filter by testable attribute`,
      type: 'boolean'
    },
    {
      name: 'trackable',
      label: t`Trackable`,
      description: t`Filter by trackable attribute`,
      type: 'boolean'
    },
    {
      name: 'has_units',
      label: t`Has Units`,
      description: t`Filter by stock items which have units`,
      type: 'boolean'
    },
    {
      name: 'has_ipn',
      label: t`Has IPN`,
      description: t`Filter by stock items which have an internal stock item number`,
      type: 'boolean'
    },
    {
      name: 'has_stock',
      label: t`Has Stock`,
      description: t`Filter by stock items which have stock`,
      type: 'boolean'
    },
    {
      name: 'low_stock',
      label: t`Low Stock`,
      description: t`Filter by stock items which have low stock`,
      type: 'boolean'
    },
    {
      name: 'high_stock',
      label: t`High Stock`,
      description: t`Filter by stock items which have high stock`,
      type: 'boolean'
    },
    {
      name: 'purchaseable',
      label: t`Purchaseable`,
      description: t`Filter by stock items which are purchaseable`,
      type: 'boolean'
    },
    {
      name: 'salable',
      label: t`Salable`,
      description: t`Filter by stock items which are salable`,
      type: 'boolean'
    },
    {
      name: 'virtual',
      label: t`Virtual`,
      description: t`Filter by stock items which are virtual`,
      type: 'boolean'
    },
    {
      name: 'is_template',
      label: t`Is Template`,
      description: t`Filter by stock items which are templates`,
      type: 'boolean'
    },
    {
      name: 'is_variant',
      label: t`Is Variant`,
      description: t`Filter by stock items which are variants`,
      type: 'boolean'
    },
    {
      name: 'is_revision',
      label: t`Is Revision`,
      description: t`Filter by stock items which are revisions`
    },
    {
      name: 'has_revisions',
      label: t`Has Revisions`,
      description: t`Filter by stock items which have revisions`
    },
    {
      name: 'has_pricing',
      label: t`Has Pricing`,
      description: t`Filter by stock items which have pricing information`,
      type: 'boolean'
    },
    {
      name: 'unallocated_stock',
      label: t`Available Stock`,
      description: t`Filter by stock items which have available stock`,
      type: 'boolean'
    },
    {
      name: 'starred',
      label: t`Subscribed`,
      description: t`Filter by stock items to which the user is subscribed`,
      type: 'boolean'
    }
  ];
}
