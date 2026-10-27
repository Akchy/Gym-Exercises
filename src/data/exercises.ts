import type { Equipment, Experience, MuscleGroup } from '../core/types';
import type { MotionId } from './motions';

export type Prop = 'none' | 'barbell' | 'dumbbell' | 'kettlebell' | 'handle';

export interface Exercise {
  id: string;
  name: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  /** Any one of these is enough to perform the exercise. */
  equipment: Equipment[];
  level: Experience;
  compound: boolean;
  motion: MotionId;
  prop: Prop;
  steps: string[];
  tip: string;
}

const e = (x: Exercise) => x;

export const EXERCISES: readonly Exercise[] = [
  // Chest
  e({ id: 'push-up', name: 'Push-up', primary: 'chest', secondary: ['triceps', 'shoulders', 'core'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'pushup', prop: 'none',
    steps: ['Hands slightly wider than shoulders, body in a straight line.', 'Lower your chest until it nearly touches the floor.', 'Push back up, keeping hips level.'],
    tip: 'Too hard? Put your hands on a bench (incline) or your knees on the floor.' }),
  e({ id: 'incline-push-up', name: 'Incline Push-up', primary: 'chest', secondary: ['triceps', 'shoulders'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'pushup', prop: 'none',
    steps: ['Place hands on a bench or sturdy box.', 'Keep a straight line from head to heels.', 'Lower chest to the edge, then press away.'],
    tip: 'The higher the surface, the easier the exercise.' }),
  e({ id: 'bench-press', name: 'Barbell Bench Press', primary: 'chest', secondary: ['triceps', 'shoulders'], equipment: ['barbell'], level: 'intermediate', compound: true, motion: 'bench-press', prop: 'barbell',
    steps: ['Lie on the bench, eyes under the bar, feet flat.', 'Grip slightly wider than shoulders and unrack.', 'Lower the bar to mid-chest with control.', 'Press up until arms are straight.'],
    tip: 'Always use a spotter or safety arms when going heavy.' }),
  e({ id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', primary: 'chest', secondary: ['triceps', 'shoulders'], equipment: ['dumbbell'], level: 'beginner', compound: true, motion: 'bench-press', prop: 'dumbbell',
    steps: ['Lie on a bench holding dumbbells above your chest.', 'Lower them to the sides of your chest.', 'Press up and slightly together.'],
    tip: 'Keep your shoulder blades squeezed against the bench.' }),
  e({ id: 'machine-chest-press', name: 'Machine Chest Press', primary: 'chest', secondary: ['triceps', 'shoulders'], equipment: ['machine'], level: 'beginner', compound: true, motion: 'chest-press', prop: 'handle',
    steps: ['Adjust the seat so handles line up with mid-chest.', 'Press the handles forward until arms are straight.', 'Return slowly without letting the weights touch.'],
    tip: 'A great safe option to learn pressing strength.' }),
  e({ id: 'cable-fly', name: 'Cable / Band Fly', primary: 'chest', secondary: ['shoulders'], equipment: ['cable', 'band'], level: 'beginner', compound: false, motion: 'fly', prop: 'handle',
    steps: ['Stand between two cable handles (or a band anchored behind you).', 'With a soft bend in the elbows, bring your hands together in front.', 'Open back up slowly until you feel a chest stretch.'],
    tip: 'Think of hugging a big tree; the elbow angle stays fixed.' }),
  // Back
  e({ id: 'pull-up', name: 'Pull-up', primary: 'back', secondary: ['biceps', 'core'], equipment: ['bodyweight'], level: 'intermediate', compound: true, motion: 'pullup', prop: 'none',
    steps: ['Hang from a bar, palms facing away, hands shoulder-width or wider.', 'Pull your chest toward the bar.', 'Lower all the way down with control.'],
    tip: 'Use a resistance band under your feet for assistance.' }),
  e({ id: 'chin-up', name: 'Chin-up', primary: 'biceps', secondary: ['back'], equipment: ['bodyweight'], level: 'intermediate', compound: true, motion: 'pullup', prop: 'none',
    steps: ['Hang from a bar with palms facing you.', 'Pull until your chin passes the bar.', 'Lower slowly to a full hang.'],
    tip: 'Usually a little easier than a pull-up.' }),
  e({ id: 'lat-pulldown', name: 'Lat Pulldown', primary: 'back', secondary: ['biceps'], equipment: ['machine', 'cable'], level: 'beginner', compound: true, motion: 'pulldown', prop: 'handle',
    steps: ['Sit with thighs under the pads, grip the bar wide.', 'Pull the bar down to your upper chest.', 'Let it rise slowly until arms are straight.'],
    tip: 'Lead with the elbows; avoid leaning far back.' }),
  e({ id: 'barbell-row', name: 'Barbell Bent-over Row', primary: 'back', secondary: ['biceps', 'core'], equipment: ['barbell'], level: 'intermediate', compound: true, motion: 'row', prop: 'barbell',
    steps: ['Hinge at the hips with a flat back, bar hanging at arm length.', 'Row the bar to your lower ribs.', 'Lower it under control.'],
    tip: 'Keep your spine neutral; do not round your lower back.' }),
  e({ id: 'dumbbell-row', name: 'One-arm Dumbbell Row', primary: 'back', secondary: ['biceps'], equipment: ['dumbbell', 'kettlebell'], level: 'beginner', compound: true, motion: 'row', prop: 'dumbbell',
    steps: ['Support one hand and knee on a bench.', 'Pull the dumbbell toward your hip.', 'Lower until the arm is straight. Switch sides.'],
    tip: 'Squeeze your shoulder blade back at the top.' }),
  e({ id: 'seated-cable-row', name: 'Seated Cable Row', primary: 'back', secondary: ['biceps'], equipment: ['cable', 'machine', 'band'], level: 'beginner', compound: true, motion: 'seated-row', prop: 'handle',
    steps: ['Sit tall with feet on the platform and knees slightly bent.', 'Pull the handle to your stomach.', 'Extend arms forward slowly.'],
    tip: 'Keep your torso still; the arms and back do the work.' }),
  e({ id: 'deadlift', name: 'Deadlift', primary: 'back', secondary: ['legs', 'glutes', 'core'], equipment: ['barbell'], level: 'advanced', compound: true, motion: 'hinge', prop: 'barbell',
    steps: ['Bar over mid-foot, grip just outside the knees.', 'Brace your core, flat back, chest up.', 'Push the floor away and stand tall.', 'Lower by pushing hips back.'],
    tip: 'Learn this with light weight first; form beats load.' }),
  // Shoulders
  e({ id: 'overhead-press', name: 'Barbell Overhead Press', primary: 'shoulders', secondary: ['triceps', 'core'], equipment: ['barbell'], level: 'intermediate', compound: true, motion: 'overhead-press', prop: 'barbell',
    steps: ['Stand with the bar at your collarbones.', 'Brace and press the bar straight overhead.', 'Lower back to the start.'],
    tip: 'Squeeze your glutes to avoid arching your lower back.' }),
  e({ id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', primary: 'shoulders', secondary: ['triceps'], equipment: ['dumbbell', 'kettlebell'], level: 'beginner', compound: true, motion: 'overhead-press', prop: 'dumbbell',
    steps: ['Hold dumbbells at shoulder height.', 'Press overhead until arms are straight.', 'Lower with control.'],
    tip: 'Can be done seated for more stability.' }),
  e({ id: 'pike-push-up', name: 'Pike Push-up', primary: 'shoulders', secondary: ['triceps'], equipment: ['bodyweight'], level: 'intermediate', compound: true, motion: 'pushup', prop: 'none',
    steps: ['Start in a push-up then lift hips high (an upside-down V).', 'Bend elbows to lower your head toward the floor.', 'Press back up.'],
    tip: 'A no-equipment way to train overhead pressing.' }),
  e({ id: 'lateral-raise', name: 'Lateral Raise', primary: 'shoulders', secondary: [], equipment: ['dumbbell', 'cable', 'band'], level: 'beginner', compound: false, motion: 'lateral-raise', prop: 'dumbbell',
    steps: ['Stand holding light weights at your sides.', 'Raise arms out to shoulder height.', 'Lower slowly.'],
    tip: 'Light weight and control matter more than heavy weight here.' }),
  e({ id: 'front-raise', name: 'Front Raise', primary: 'shoulders', secondary: [], equipment: ['dumbbell', 'cable', 'band'], level: 'beginner', compound: false, motion: 'front-raise', prop: 'dumbbell',
    steps: ['Hold weights in front of your thighs.', 'Raise one or both arms forward to shoulder height.', 'Lower with control.'],
    tip: 'Avoid swinging; keep the torso still.' }),
  e({ id: 'shrug', name: 'Shrug', primary: 'shoulders', secondary: ['back'], equipment: ['dumbbell', 'barbell', 'kettlebell'], level: 'beginner', compound: false, motion: 'shrug', prop: 'dumbbell',
    steps: ['Hold weights at your sides.', 'Lift your shoulders straight up toward your ears.', 'Pause, then lower.'],
    tip: 'Do not roll the shoulders; straight up and down.' }),
  // Arms
  e({ id: 'dumbbell-curl', name: 'Dumbbell Biceps Curl', primary: 'biceps', secondary: [], equipment: ['dumbbell', 'kettlebell'], level: 'beginner', compound: false, motion: 'curl', prop: 'dumbbell',
    steps: ['Stand with dumbbells at your sides, palms forward.', 'Curl the weights up, keeping elbows by your sides.', 'Lower slowly.'],
    tip: 'Slow lowering (3 seconds) builds more muscle.' }),
  e({ id: 'barbell-curl', name: 'Barbell Curl', primary: 'biceps', secondary: [], equipment: ['barbell'], level: 'beginner', compound: false, motion: 'curl', prop: 'barbell',
    steps: ['Hold the bar shoulder-width, palms up.', 'Curl it to your shoulders.', 'Lower to full extension.'],
    tip: 'Keep your back still; no swinging.' }),
  e({ id: 'hammer-curl', name: 'Hammer Curl', primary: 'biceps', secondary: [], equipment: ['dumbbell'], level: 'beginner', compound: false, motion: 'curl', prop: 'dumbbell',
    steps: ['Hold dumbbells with palms facing each other.', 'Curl up keeping the neutral grip.', 'Lower slowly.'],
    tip: 'Also trains the forearms.' }),
  e({ id: 'band-curl', name: 'Band / Cable Curl', primary: 'biceps', secondary: [], equipment: ['band', 'cable'], level: 'beginner', compound: false, motion: 'curl', prop: 'handle',
    steps: ['Stand on the band (or face a low cable).', 'Curl the handles up.', 'Lower with control.'],
    tip: 'Constant tension makes this great for finishing a workout.' }),
  e({ id: 'bench-dip', name: 'Bench Dip', primary: 'triceps', secondary: ['chest', 'shoulders'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'dip', prop: 'none',
    steps: ['Hands on the edge of a bench behind you.', 'Bend elbows to lower your body.', 'Press back up.'],
    tip: 'Stop if you feel shoulder pain; do not go too deep.' }),
  e({ id: 'parallel-dip', name: 'Parallel Bar Dip', primary: 'triceps', secondary: ['chest', 'shoulders'], equipment: ['bodyweight'], level: 'intermediate', compound: true, motion: 'dip', prop: 'none',
    steps: ['Support yourself on parallel bars with straight arms.', 'Lower until upper arms are about parallel to the floor.', 'Press back up.'],
    tip: 'Lean forward to target chest more, stay upright for triceps.' }),
  e({ id: 'overhead-triceps-extension', name: 'Overhead Triceps Extension', primary: 'triceps', secondary: [], equipment: ['dumbbell', 'cable', 'band'], level: 'beginner', compound: false, motion: 'triceps-overhead', prop: 'dumbbell',
    steps: ['Hold one dumbbell overhead with both hands.', 'Lower it behind your head by bending the elbows.', 'Extend back up.'],
    tip: 'Keep elbows pointing forward, close to your head.' }),
  e({ id: 'triceps-pushdown', name: 'Triceps Pushdown', primary: 'triceps', secondary: [], equipment: ['cable', 'band'], level: 'beginner', compound: false, motion: 'pushdown', prop: 'handle',
    steps: ['Face a high cable/band with elbows at your sides.', 'Push the handle down until arms are straight.', 'Let it return slowly.'],
    tip: 'Only the forearms move; elbows stay pinned.' }),
  e({ id: 'diamond-push-up', name: 'Diamond Push-up', primary: 'triceps', secondary: ['chest'], equipment: ['bodyweight'], level: 'intermediate', compound: true, motion: 'pushup', prop: 'none',
    steps: ['Push-up position with hands together under your chest.', 'Lower with elbows close to your body.', 'Press up.'],
    tip: 'Do it from your knees to start.' }),
  // Legs
  e({ id: 'bodyweight-squat', name: 'Bodyweight Squat', primary: 'legs', secondary: ['glutes', 'core'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'squat', prop: 'none',
    steps: ['Feet shoulder-width apart, toes slightly out.', 'Sit back and down, keeping chest up.', 'Go as low as is comfortable, then stand.'],
    tip: 'Knees follow the direction of your toes.' }),
  e({ id: 'goblet-squat', name: 'Goblet Squat', primary: 'legs', secondary: ['glutes', 'core'], equipment: ['dumbbell', 'kettlebell'], level: 'beginner', compound: true, motion: 'squat-goblet', prop: 'kettlebell',
    steps: ['Hold a weight against your chest.', 'Squat down between your knees.', 'Drive up through your heels.'],
    tip: 'The best way to learn a good squat.' }),
  e({ id: 'barbell-squat', name: 'Barbell Back Squat', primary: 'legs', secondary: ['glutes', 'core'], equipment: ['barbell'], level: 'intermediate', compound: true, motion: 'squat-barbell', prop: 'barbell',
    steps: ['Bar on your upper back, feet shoulder-width.', 'Brace, then squat until thighs are about parallel.', 'Stand up driving through the whole foot.'],
    tip: 'Use the safety bars of the rack.' }),
  e({ id: 'lunge', name: 'Lunge', primary: 'legs', secondary: ['glutes'], equipment: ['bodyweight', 'dumbbell', 'kettlebell'], level: 'beginner', compound: true, motion: 'lunge', prop: 'none',
    steps: ['Step forward with one leg.', 'Lower until both knees are about 90°.', 'Push back to standing; alternate legs.'],
    tip: 'Keep your torso upright.' }),
  e({ id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', primary: 'legs', secondary: ['glutes'], equipment: ['bodyweight', 'dumbbell'], level: 'intermediate', compound: true, motion: 'lunge', prop: 'dumbbell',
    steps: ['Rear foot on a bench behind you.', 'Lower straight down on the front leg.', 'Drive up through the front heel.'],
    tip: 'Hold onto something for balance at first.' }),
  e({ id: 'leg-press', name: 'Leg Press', primary: 'legs', secondary: ['glutes'], equipment: ['machine'], level: 'beginner', compound: true, motion: 'leg-press', prop: 'none',
    steps: ['Sit with feet shoulder-width on the platform.', 'Release the safety and lower the platform toward you.', 'Press back without locking your knees.'],
    tip: 'Keep your lower back flat against the pad.' }),
  e({ id: 'leg-extension', name: 'Leg Extension', primary: 'legs', secondary: [], equipment: ['machine', 'band'], level: 'beginner', compound: false, motion: 'leg-extension', prop: 'none',
    steps: ['Sit with the pad on your lower shins.', 'Straighten your legs.', 'Lower slowly.'],
    tip: 'Isolates the front of the thigh (quadriceps).' }),
  e({ id: 'leg-curl', name: 'Leg Curl', primary: 'legs', secondary: [], equipment: ['machine', 'band'], level: 'beginner', compound: false, motion: 'leg-extension', prop: 'none',
    steps: ['Sit or lie with the pad behind your ankles.', 'Curl your heels toward you.', 'Return slowly.'],
    tip: 'Targets the back of the thigh (hamstrings).' }),
  e({ id: 'romanian-deadlift', name: 'Romanian Deadlift', primary: 'legs', secondary: ['glutes', 'back'], equipment: ['barbell', 'dumbbell', 'kettlebell'], level: 'intermediate', compound: true, motion: 'hinge', prop: 'dumbbell',
    steps: ['Stand holding the weight, knees slightly bent.', 'Push hips back, sliding the weight down your legs.', 'Stop when you feel a hamstring stretch, then stand.'],
    tip: 'Back stays flat the whole time.' }),
  // Glutes
  e({ id: 'glute-bridge', name: 'Glute Bridge', primary: 'glutes', secondary: ['legs', 'core'], equipment: ['bodyweight', 'band'], level: 'beginner', compound: false, motion: 'bridge', prop: 'none',
    steps: ['Lie on your back, knees bent, feet flat.', 'Squeeze glutes and lift hips.', 'Pause at the top, then lower.'],
    tip: 'Push through your heels.' }),
  e({ id: 'hip-thrust', name: 'Barbell Hip Thrust', primary: 'glutes', secondary: ['legs'], equipment: ['barbell', 'dumbbell'], level: 'intermediate', compound: true, motion: 'bridge', prop: 'barbell',
    steps: ['Upper back on a bench, weight across your hips.', 'Drive hips up until your body is flat.', 'Lower under control.'],
    tip: 'Use a pad on the bar for comfort.' }),
  e({ id: 'kettlebell-swing', name: 'Kettlebell Swing', primary: 'glutes', secondary: ['legs', 'back', 'cardio'], equipment: ['kettlebell', 'dumbbell'], level: 'intermediate', compound: true, motion: 'hinge', prop: 'kettlebell',
    steps: ['Hinge and hike the kettlebell back between your legs.', 'Snap your hips forward to swing it to chest height.', 'Let it fall back and repeat.'],
    tip: 'The power comes from the hips, not the arms.' }),
  // Calves
  e({ id: 'calf-raise', name: 'Standing Calf Raise', primary: 'calves', secondary: [], equipment: ['bodyweight', 'dumbbell', 'machine'], level: 'beginner', compound: false, motion: 'calf-raise', prop: 'none',
    steps: ['Stand on the edge of a step.', 'Rise up on your toes as high as possible.', 'Lower heels below the step.'],
    tip: 'Pause at the top for a second.' }),
  // Core
  e({ id: 'plank', name: 'Plank', primary: 'core', secondary: ['shoulders'], equipment: ['bodyweight'], level: 'beginner', compound: false, motion: 'plank', prop: 'none',
    steps: ['Forearms on the floor, elbows under shoulders.', 'Keep a straight line from head to heels.', 'Hold while breathing steadily.'],
    tip: 'For planks, "reps" are seconds held.' }),
  e({ id: 'crunch', name: 'Crunch', primary: 'core', secondary: [], equipment: ['bodyweight'], level: 'beginner', compound: false, motion: 'crunch', prop: 'none',
    steps: ['Lie on your back with knees bent.', 'Curl your shoulders off the floor.', 'Lower slowly.'],
    tip: 'Do not pull on your neck.' }),
  e({ id: 'lying-leg-raise', name: 'Lying Leg Raise', primary: 'core', secondary: [], equipment: ['bodyweight'], level: 'beginner', compound: false, motion: 'leg-raise', prop: 'none',
    steps: ['Lie flat with legs straight.', 'Raise legs to vertical.', 'Lower slowly without touching the floor.'],
    tip: 'Press your lower back into the floor.' }),
  e({ id: 'mountain-climber', name: 'Mountain Climber', primary: 'core', secondary: ['cardio', 'shoulders'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'mountain-climber', prop: 'none',
    steps: ['Start in a high plank.', 'Drive one knee toward your chest.', 'Switch legs quickly.'],
    tip: 'Keep your hips low.' }),
  // Cardio
  e({ id: 'jumping-jack', name: 'Jumping Jacks', primary: 'cardio', secondary: ['calves'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'jumping-jack', prop: 'none',
    steps: ['Stand with feet together, arms at sides.', 'Jump feet apart while raising arms overhead.', 'Jump back to start.'],
    tip: 'Step side-to-side instead of jumping for a low-impact version.' }),
  e({ id: 'high-knees', name: 'High Knees / Jog', primary: 'cardio', secondary: ['legs', 'core'], equipment: ['bodyweight', 'machine'], level: 'beginner', compound: true, motion: 'run', prop: 'none',
    steps: ['Run in place (or on a treadmill).', 'Drive knees up to hip height.', 'Pump your arms.'],
    tip: 'For cardio, "reps" can be counted as minutes.' }),
  e({ id: 'jump-rope', name: 'Jump Rope', primary: 'cardio', secondary: ['calves'], equipment: ['bodyweight'], level: 'beginner', compound: true, motion: 'jump', prop: 'none',
    steps: ['Hold the rope handles at hip height.', 'Turn the rope with your wrists.', 'Small jumps on the balls of your feet.'],
    tip: 'No rope? Do the motion without one.' }),
  e({ id: 'burpee', name: 'Burpee', primary: 'cardio', secondary: ['chest', 'legs', 'core'], equipment: ['bodyweight'], level: 'intermediate', compound: true, motion: 'burpee', prop: 'none',
    steps: ['Squat down and place hands on the floor.', 'Jump feet back into a plank.', 'Jump feet in and leap up with arms overhead.'],
    tip: 'Skip the jump and step back for an easier version.' }),
];

const BY_ID = new Map(EXERCISES.map((x) => [x.id, x]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function isAvailable(ex: Exercise, equipment: readonly Equipment[]): boolean {
  return ex.equipment.some((eq) => eq === 'bodyweight' || equipment.includes(eq));
}

export interface ExerciseFilter {
  muscle?: MuscleGroup | 'all';
  equipment?: readonly Equipment[];
  query?: string;
}

export function filterExercises(filter: ExerciseFilter, list: readonly Exercise[] = EXERCISES): Exercise[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return list.filter((ex) => {
    if (filter.muscle && filter.muscle !== 'all' && ex.primary !== filter.muscle && !ex.secondary.includes(filter.muscle)) {
      return false;
    }
    if (filter.equipment && !isAvailable(ex, filter.equipment)) return false;
    if (q && !ex.name.toLowerCase().includes(q) && !ex.primary.includes(q)) return false;
    return true;
  });
}
