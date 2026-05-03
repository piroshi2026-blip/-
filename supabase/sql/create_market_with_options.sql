-- Supabase SQL Editor で 1 回実行してください（RPC が存在しない場合 or 再作成したい場合）
-- markets と market_options に一括挿入する関数。
-- Admin 画面の「公開」ボタン・PDCA 自動生成の両方から呼ばれます。

create or replace function public.create_market_with_options(
  title_input       text,
  category_input    text,
  end_date_input    timestamptz,
  description_input text    default '',
  image_url_input   text    default '',
  options_input     text[]  default array[]::text[]
)
returns void
language plpgsql
security definer
as $$
declare
  new_id bigint;
  opt    text;
begin
  insert into public.markets
    (title, category, end_date, description, image_url, is_resolved, total_pool)
  values
    (title_input, category_input, end_date_input, description_input, image_url_input, false, 0)
  returning id into new_id;

  foreach opt in array options_input loop
    insert into public.market_options (market_id, name, pool)
    values (new_id, opt, 0);
  end loop;
end;
$$;

-- anon（管理画面）・service_role（PDCA自動）の両方に実行権限を付与
grant execute on function public.create_market_with_options
  to anon, authenticated, service_role;
