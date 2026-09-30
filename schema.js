// ============================================================================
// CENTRAL DATA MODEL
// ----------------------------------------------------------------------------
// Nothing about the user's actual routine is hardcoded into the UI. Every
// section reads its habits/steps/challenges/subjects from this data
// structure, and every value here is editable at runtime (mostly via the
// Settings page, some inline on their own section page). This is what makes
// the app "modular / easy to update" per the project spec.
//
// If you want to change defaults for a brand-new install, edit defaultState()
// below. Existing users' saved data (in localStorage) will NOT be touched by
// changes here — see deepMergeDefaults() in js/store.js for how upgrades are
// handled safely.
// ============================================================================

export const SCHEMA_VERSION = 1;

export const CATEGORIES = [
  { id: 'fitness', label: 'Fitness', icon: '🏃', route: '/fitness' },
  { id: 'badminton', label: 'Badminton', icon: '🏸', route: '/badminton' },
  { id: 'skin', label: 'Skin', icon: '🧴', route: '/skincare' },
  { id: 'hair', label: 'Hair', icon: '💇', route: '/haircare' },
  { id: 'posture', label: 'Posture', icon: '🧍', route: '/posture' },
  { id: 'social', label: 'Social', icon: '🗣️', route: '/social' },
  { id: 'mindset', label: 'Mindset', icon: '🧠', route: null },
  { id: 'study', label: 'Study', icon: '📚', route: '/study' },
];

export function defaultState() {
  return {
    meta: { createdAt: new Date().toISOString(), version: SCHEMA_VERSION },

    settings: {
      theme: 'system', // 'light' | 'dark' | 'system'
      displayName: '',
      studyGoalMinutes: 180, // editable daily study goal, used by the Study page + dashboard
    },

    // Generic habit definitions. type: 'boolean' (done/not done) or 'time' (minutes).
    // Add/remove/rename freely from Settings -> Habits.
    habits: [
      { id: 'h_fitness', categoryId: 'fitness', label: 'Workout', type: 'boolean', active: true },
      { id: 'h_badminton', categoryId: 'badminton', label: 'Badminton practice', type: 'boolean', active: true },
      { id: 'h_skin_am', categoryId: 'skin', label: 'Morning skincare', type: 'boolean', active: true },
      { id: 'h_skin_pm', categoryId: 'skin', label: 'Night skincare', type: 'boolean', active: true },
      { id: 'h_hair', categoryId: 'hair', label: 'Hair care', type: 'boolean', active: true },
      { id: 'h_posture', categoryId: 'posture', label: 'Posture check', type: 'boolean', active: true },
      { id: 'h_stretch', categoryId: 'posture', label: 'Stretching', type: 'boolean', active: true },
      { id: 'h_water', categoryId: 'posture', label: 'Water intake', type: 'boolean', active: true },
      { id: 'h_social', categoryId: 'social', label: 'Social challenge', type: 'boolean', active: true },
      { id: 'h_mindset', categoryId: 'mindset', label: 'Mindset practice', type: 'boolean', active: true },
      { id: 'h_study', categoryId: 'study', label: 'Study session', type: 'time', active: true },
    ],

    // logs[dateStr][habitId] = true/false (boolean habits) or minutes (time habits)
    logs: {},

    skincare: {
      morningSteps: ['Cleanser', 'Treatment', 'Moisturizer', 'Sunscreen'],
      nightSteps: ['Cleanser', 'Treatment', 'Moisturizer'],
    },
    // skincareLog[dateStr] = { morning: [stepNamesDone], night: [...], note: '' }
    skincareLog: {},

    haircare: {
      steps: ['Shampoo', 'Conditioner', 'Oil'],
    },
    // haircareLog[dateStr] = { steps: [...done], note: '' }
    haircareLog: {},

    badmintonSkills: ['Footwork', 'Serve', 'Smash', 'Drop', 'Clear', 'Net play', 'Defense', 'Stamina'],
    badmintonSessions: [
      // { id, date, durationMin, type, skills: [], notes }
    ],

    socialChallenges: [
      'Talked to someone new', 'Started a conversation', 'Asked a question',
      'Maintained eye contact', 'Participated in a group conversation',
      'Expressed an opinion', 'Made someone laugh', 'Spoke confidently',
      'Did something outside my comfort zone',
    ],
    // socialLog[dateStr] = { completed: [challengeNames], wentWell, awkward, tomorrow }
    socialLog: {},

    workouts: [
      // { id, name, exercises: [{name, sets, reps}], notes }
    ],
    // workoutLog[dateStr] = [{ id, workoutId, loggedAt }]
    workoutLog: {},

    subjects: [
      // { id, name, progressPct, topics: [string], studyLog: { dateStr: minutes } }
    ],

    // Deadlines / assignments / exams shown on the Study page timeline.
    tasks: [
      // { id, subjectId (optional, '' = none), title, type: 'assignment'|'exam'|'deadline'|'other', dueDate, completed, notes }
    ],

    // Fast daily study check-ins (the "+ Log Study" quick-entry flow).
    // Separate from focusSessions so a quick manual log doesn't need to go
    // through the timer. Both are combined for Today/Week/Month stats — see
    // getStudyEntriesForDate() / computeStudyStats() in js/sections/study.js.
    studyCheckins: [
      // { id, date, subjectId ('' = none), minutes, topic, tasksCompleted, notes, loggedAt }
    ],

    // Completed/interrupted focus-timer sessions.
    focusSessions: [
      // { id, date, subjectId ('' = none), task, presetLabel, plannedMinutes, actualMinutes, status: 'completed'|'interrupted', reflection }
    ],

    // Editable focus timer presets (Settings -> Timer presets). "Custom" is
    // always available in the timer UI in addition to whatever is listed here.
    timerPresets: [
      { id: 'p_2505', label: '25 / 5 (Pomodoro)', focusMin: 25, breakMin: 5 },
      { id: 'p_5010', label: '50 / 10', focusMin: 50, breakMin: 10 },
      { id: 'p_90', label: '90 min deep work', focusMin: 90, breakMin: 0 },
    ],
  };
}
