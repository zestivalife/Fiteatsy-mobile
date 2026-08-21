import { AppState, type AppStateStatus } from 'react-native';

export const NUTRITION_TIME_ZONE = 'Asia/Kolkata';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NUTRITION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export const nutritionDate = (value: Date = new Date()) => {
  const parts = dateFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const millisecondsUntilNextNutritionDay = (now: Date = new Date()) => {
  const currentDate = nutritionDate(now);
  let lower = now.getTime();
  let upper = lower + 26 * 60 * 60 * 1000;

  while (upper - lower > 1000) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (nutritionDate(new Date(midpoint)) === currentDate) lower = midpoint;
    else upper = midpoint;
  }

  return Math.max(1000, upper - now.getTime() + 1000);
};

export const subscribeToNutritionDay = (onDayChange: (date: string) => void) => {
  let activeDate = nutritionDate();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const reconcile = () => {
    const nextDate = nutritionDate();
    if (nextDate !== activeDate) {
      activeDate = nextDate;
      onDayChange(nextDate);
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(reconcile, millisecondsUntilNextNutritionDay());
  };

  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') reconcile();
  });
  reconcile();

  return () => {
    if (timer) clearTimeout(timer);
    appStateSubscription.remove();
  };
};
