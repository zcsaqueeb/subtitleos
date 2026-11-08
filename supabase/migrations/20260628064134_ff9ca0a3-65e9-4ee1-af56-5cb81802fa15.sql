UPDATE public.app_settings
SET value = jsonb_set(jsonb_set(value, '{basePriceUsd}', '1'::jsonb, true), '{basePriceInr}', '94.62'::jsonb, true),
    updated_at = now()
WHERE key = 'studio_pricing';