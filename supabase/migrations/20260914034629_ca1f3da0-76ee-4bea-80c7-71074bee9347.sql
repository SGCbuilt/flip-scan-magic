select cron.schedule(
  'auction-watch-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://lxdohdgfrrasymqlghfg.supabase.co/functions/v1/auction-watch-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);