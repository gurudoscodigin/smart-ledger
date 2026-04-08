select cron.schedule(
  'telegram-poll-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://fjevawaawhnoxskalwsm.supabase.co/functions/v1/telegram-poll',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZXZhd2Fhd2hub3hza2Fsd3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDg4ODgsImV4cCI6MjA5MTIyNDg4OH0.EMmz4kt-285VJMoXG3NfLFFEmIaHYLcx9IrupvIG-KE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
