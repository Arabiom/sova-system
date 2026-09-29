-- Registration form: was the amount transferred to the company's account, with the transfer
-- receipt attached. The receipt lives in the private "expense-receipts" bucket, in the
-- folder of whoever recorded the payment (<user id>/payments/…) — finance and admin see all.
alter table public.payments add column if not exists receipt_path text;
alter table public.payments add column if not exists transfer_status text;
