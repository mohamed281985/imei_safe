-- Remove seller/buyer personal data from ownership transfer records.
-- Keep legacy columns for schema compatibility.
update public.transfer_records
set
  seller_name = '',
  seller_phone = '',
  seller_id_last6 = '',
  buyer_name = '',
  buyer_phone = '',
  buyer_id_last6 = '';
