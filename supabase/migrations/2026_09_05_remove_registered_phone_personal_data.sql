-- Remove personal data from registered phone records.
-- Keep the columns for schema compatibility, but do not retain their values.
update public.registered_phones
set
  owner_name = '',
  phone_number = '',
  country_code = '',
  email = '',
  id_last6 = '';
