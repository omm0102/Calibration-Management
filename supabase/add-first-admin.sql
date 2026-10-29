-- First create your APPLICATION account in Supabase Authentication > Users > Add user.
-- Replace the email below with that account's email. This is not your Supabase GitHub login.
do $$
declare account_id uuid;
begin
 select id into account_id from auth.users where lower(email)=lower('REPLACE_WITH_YOUR_EMAIL');
 if account_id is null then raise exception 'Account not found. Create the Authentication user first and replace the email.'; end if;
 insert into public.calibration_members(workspace_id,user_id,role)
 select id,account_id,'admin' from public.calibration_workspaces where slug='calibration-management'
 on conflict(workspace_id,user_id) do update set role=excluded.role;
end $$;
