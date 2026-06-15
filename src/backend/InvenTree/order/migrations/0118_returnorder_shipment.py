from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('order', '0117_purchaseorderextraline_line_int_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='returnorder',
            name='shipment',
            field=models.ForeignKey(
                blank=True,
                help_text='Sales order shipment associated with this return order',
                null=True,
                on_delete=models.SET_NULL,
                related_name='return_orders',
                to='order.salesordershipment',
                verbose_name='Shipment',
            ),
        ),
    ]
