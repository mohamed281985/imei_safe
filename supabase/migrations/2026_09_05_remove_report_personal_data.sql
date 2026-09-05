-- Remove personal data from lost-phone reports.
-- Keep legacy columns for schema compatibility, but retain no personal values.
update public.phone_reports
set
  owner_name = '',
  phone_number = '',
  country_code = '',
  email = '',
  id_last6 = '';
