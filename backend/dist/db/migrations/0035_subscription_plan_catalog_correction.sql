update subscription_plans
set is_active = true,
    is_featured = (code = 'WELLNESS_TRACKING_12M'),
    badge = case when code = 'WELLNESS_TRACKING_12M' then 'Best Value' else null end,
    display_order = case
      when code = 'WELLNESS_TRACKING_6M' then 10
      when code = 'WELLNESS_TRACKING_12M' then 20
      else display_order
    end
where code in ('WELLNESS_TRACKING_6M', 'WELLNESS_TRACKING_12M');
