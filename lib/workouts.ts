export const workouts = [
  {
    id: '124141234',
    date: '2026-03-15',
    durationSeconds: 3600,
    notes: 'Felt strong today, increased weight on leg press.',
    blocks: [
      {
        id: '12341241',
        order: 1,
        type: 'superset',
        name: 'Leg press + calf raise',
        exerciseIds: ['leg_press', 'calf_raise'],
        sets: 2,
        datetime: '10:00:00',
        events: [
          {
            type: 'set',
            datetime: '10:02:00',
            subSets: [
              { exerciseId: 'leg_press', weightKg: 100, rep_type: 'full', reps: 10, rpe: 8, datetime: '10:02:00' },
              { exerciseId: 'calf_raise', weightKg: 50, rep_type: 'full', reps: 15, rpe: 8, datetime: '10:02:30' }
            ],
          },
          { type: 'rest', durationSeconds: 60, datetime: '10:03:00' },
          {
            type: 'set',
            datetime: '10:04:00',
            subSets: [
              { exerciseId: 'leg_press', weightKg: 100, rep_type: 'full', reps: 9, rpe: 9.5, datetime: '10:04:00' },
              { exerciseId: 'leg_press', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:04:10' },
              { exerciseId: 'calf_raise', weightKg: 50, rep_type: 'full', reps: 15, rpe: 9, datetime: '10:04:30' },
              { exerciseId: 'calf_raise', weightKg: 50, rep_type: 'bot 1/2', reps: 2, rpe: 9, datetime: '10:04:45' }
            ],
          },
        ],
      },
      {
        id: '132424143',
        order: 2,
        type: 'single',
        name: 'Leg extension',
        exerciseIds: ['leg_extension'],
        datetime: '10:14:00',
        sets: 2,
        events: [
          {
            type: 'set',
            datetime: '10:15:00',
            subSets: [
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'full', reps: 10, rpe: 8, datetime: '10:15:00' }
            ],
          },
          { type: 'rest', durationSeconds: 60, datetime: '10:16:00' },
          {
            type: 'set',
            datetime: '10:17:00',
            subSets: [
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'full', reps: 9, rpe: 9.5, datetime: '10:17:00' },
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:17:15' }
            ],
          },
        ],
      },
    ],
  },
  {
    id: '21241241234',
    date: '2026-03-14',
    durationSeconds: 3600,
    notes: 'Ok workout',
    blocks: [
      {
        id: '12414134',
        order: 1,
        type: 'superset',
        name: 'Leg press + calf raise',
        exerciseIds: ['leg_press', 'calf_raise'],
        sets: 2,
        datetime: '10:00:00',
        events: [
          {
            type: 'set',
            datetime: '10:02:00',
            subSets: [
              { exerciseId: 'leg_press', weightKg: 100, rep_type: 'full', reps: 10, rpe: 8, datetime: '10:02:00' },
              { exerciseId: 'calf_raise', weightKg: 50, rep_type: 'full', reps: 15, rpe: 8, datetime: '10:02:30' }
            ],
          },
          { type: 'rest', durationSeconds: 60, datetime: '10:03:00' },
          {
            type: 'set',
            datetime: '10:04:00',
            subSets: [
              { exerciseId: 'leg_press', weightKg: 100, rep_type: 'full', reps: 9, rpe: 9.5, datetime: '10:04:00' },
              { exerciseId: 'leg_press', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:04:10' },
              { exerciseId: 'calf_raise', weightKg: 50, rep_type: 'full', reps: 15, rpe: 9, datetime: '10:04:30' },
              { exerciseId: 'calf_raise', weightKg: 50, rep_type: 'bot 1/2', reps: 2, rpe: 9, datetime: '10:04:45' }
            ],
          },
        ],
      },
      {
        id: '234241341',
        order: 2,
        type: 'single',
        name: 'Leg extension',
        exerciseIds: ['leg_extension'],
        datetime: '10:05:23',
        sets: 2,
        events: [
          {
            type: 'set',
            datetime: '10:06:00',
            subSets: [
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'full', reps: 10, rpe: 8, datetime: '10:06:00' }
            ],
          },
          { type: 'rest', durationSeconds: 60, datetime: '10:07:00' },
          {
            type: 'set',
            datetime: '10:08:00',
            subSets: [
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'full', reps: 9, rpe: 9.5, datetime: '10:08:00' },
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:08:10' },
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:08:20' },
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:08:30' },
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:08:40' },
              { exerciseId: 'leg_extension', weightKg: 100, rep_type: 'top 1/2', reps: 1, rpe: 9.5, datetime: '10:08:50' }
            ],
          },
        ],
      },
    ],
  },
];