-- Remove personal data from registered phone records.
-- Keep the columns for schema compatibility, but do not retain their values.
update public.registered_phones
set
  owner_name = null,
  phone_number = null,
  country_code = null,
  email = null,
  id_last6 = null;
