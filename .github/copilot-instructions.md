# Musculucos AI Agent Instructions

## Project Overview

**Musculucos** is a React Native workout tracking and routine-building mobile app built with Expo, Expo Router, and Nativewind (Tailwind CSS). It's a cross-platform app running on iOS, Android, and Web.

### Tech Stack

- **Framework**: Expo with React Router for navigation
- **Styling**: Nativewind (Tailwind CSS for React Native) + React Native Reusables
- **State Management**: React hooks (useState) - no external store (Redux/Context) currently
- **Database**: Expo SQLite (configured in app.json but not yet integrated)
- **UI Components**: React Native Reusables + Lucide React Native icons
- **Animations**: React Native Reanimated + react-native-reanimated-carousel

## Architecture & Key Patterns

### File Structure

- `lib/` - Domain logic and data:
  - `workouts.ts` - Workout data with complex nested structure (blocks, events)
  - `exercises.ts` - Exercise definitions (name, muscleGroups, equipment, videoUrl)
  - `theme.ts` - NAV_THEME for React Navigation + custom color palette
  - `utils.ts` - Shared utilities
- `app/` - Page/screen components using Expo Router file-based routing:
  - `(tabs)/` - Tabbed interface (Tracker & Routines tabs)
  - `(tabs)/index.tsx` - Main workout tracker with carousel calendar view
  - `(tabs)/workout_builder.tsx` - Routine management interface
  - `add_routine.tsx`, `add_exercise.tsx` - Modals for creation flows
- `components/ui/` - React Native Reusables components (button, card, dialog, accordion, select, tabs, input, text)

### Data Models

**Workout** (from [lib/workouts.ts](lib/workouts.ts)):

- Top level: `datetime`, `durationSeconds`, `notes`, `blocks[]`
- Blocks have `type` ('superset' or 'single'), `exerciseIds[]`, `sets` count
- Events array captures actual performance: `type` ('set'|'rest'), `exerciseId`, `setIndex`, `weightKg`, `reps`, `rpe`, `rep_type` ('full'|'top_half'|'bottom_half')

**Exercise** (from [lib/exercises.ts](lib/exercises.ts)):

- Properties: `id`, `name`, `description`, `muscleGroups[]`, `equipment`, `videoUrl`

### UI Composition Pattern

- Main screens import domain data from `lib/` directly
- Use React Native Reusables UI primitives wrapped with Tailwind styling
- Dialog components for modals (AddRoutine, AddExercise partially implemented)
- Carousel for date/day navigation on tracker view
- Accordion for collapsible workout block details

## Development Workflow

### Running the App

```bash
npm run dev                    # Start Expo dev server
npm run android               # Run on Android emulator/device
npm run ios                   # Run on iOS simulator
npm run web                   # Run in browser
```

### Adding UI Components

Components use React Native Reusables library. To add new primitives:

```bash
npx react-native-reusables/cli@latest add [component-name]
```

Example: `npx react-native-reusables/cli@latest add select` (used in tracker view)

### Build & Deploy

- Uses Expo Application Services (EAS) for builds and deployment
- New Architecture and Edge-to-Edge enabled in Android

## Critical Patterns to Follow

1. **Component Styling**: All Tailwind classes work on React Native via Nativewind. Use `className` on all primitive components.

2. **Cross-Platform Icons**: Use Lucide React Native for icons (seen in `add_routine.tsx`). These work on all platforms.

3. **Typing**: Strict TypeScript enabled. Path alias `@/*` maps to root. Use `@/lib/` and `@/components/` imports.

4. **Theme System**:
   - Import `NAV_THEME` from `@/lib/theme` for navigation
   - Custom colors available in theme.ts (e.g., `chart1`, `chart2` for data viz)
   - Currently defaults to dark theme in root layout

5. **Event Handling**: Component interactivity uses React state. No Redux/Context yet—pass state and setters as props when needed.

6. **Safe Area**: App wrapped in `GestureHandlerRootView` and `ThemeProvider` at root. Gesture handlers required for carousel and modals.

7. **Dialogs for Complex Flows**: Use Dialog primitives (DialogTrigger, DialogContent, DialogHeader, etc.) for forms like AddRoutine and AddExercise.

## Common Tasks

- **Add a new screen**: Create `.tsx` in `app/` or `app/(tabs)/` depending on routing
- **Add domain data**: Define types and defaults in `lib/[feature].ts`
- **Create forms**: Use Dialog + Input/Select primitives from React Native Reusables
- **Style layouts**: Flex containers with Tailwind classes (e.g., `flex-1`, `flex-row`, `justify-between`)
- **Handle navigation**: Use `useRouter()` from Expo Router (`expo-router`)

## Known Incomplete Areas

- SQLite integration configured but not wired to UI
- AddExercise and AddRoutine dialogs return empty/placeholder implementations
- Workout builder (tabs/workout_builder.tsx) needs population
- No state persistence between app sessions yet

## Debugging Notes

- App runs via Expo with metro bundler (metro.config.js configured)
- Android builds: device available at `192.168.1.160:44139` (from terminal context)
- Use `npm run clean` to reset node_modules and .expo cache if build fails
