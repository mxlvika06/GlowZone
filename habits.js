import { todayStr } from './utils.js';

export function getLog(state, date = todayStr()) {
  return state.logs[date] || {};
}

export function getHabitValue(state, habitId, date = todayStr()) {
  return getLog(state, date)[habitId];
}

export function toggleBoolean(store, habitId, date = todayStr()) {
  store.update((state) => {
    if (!state.logs[date]) state.logs[date] = {};
    state.logs[date][habitId] = !state.logs[date][habitId];
  });
}

export function setBoolean(store, habitId, value, date = todayStr()) {
  store.update((state) => {
    if (!state.logs[date]) state.logs[date] = {};
    state.logs[date][habitId] = !!value;
  });
}

export function addTime(store, habitId, minutes, date = todayStr()) {
  store.update((state) => {
    if (!state.logs[date]) state.logs[date] = {};
    const current = state.logs[date][habitId] || 0;
    state.logs[date][habitId] = Math.max(0, current + minutes);
  });
}

export function activeHabits(state) {
  return state.habits.filter((h) => h.active);
}

export function habitsForCategory(state, categoryId) {
  return activeHabits(state).filter((h) => h.categoryId === categoryId);
}

export function isHabitDone(state, habit, date = todayStr()) {
  const v = getHabitValue(state, habit.id, date);
  return habit.type === 'time' ? (v || 0) > 0 : !!v;
}

/**
 * Current daily streak for a single habit: consecutive days with a
 * truthy/positive log entry. If today isn't done yet, the streak is counted
 * back from yesterday (it is still "alive" until the day actually ends) so it
 * doesn't show 0 every morning. Shared by the dashboard and Fitness page.
 * Bounded to 10 years as a safety valve against corrupt data.
 */
export function computeHabitStreak(state, habit, fromDate = todayStr()) {
  let d = new Date(fromDate + 'T00:00:00');
  if (!isHabitDone(state, habit, todayStr(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (streak <= 3650) {
    if (isHabitDone(state, habit, todayStr(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}
