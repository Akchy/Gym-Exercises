#!/usr/bin/env python3
"""Downloads exercise photos from free-exercise-db (public domain, Unlicense:
https://github.com/yuhonas/free-exercise-db) and converts them to small WebP files in
public/exercises/<our-id>-0.webp (start) and -1.webp (end).

Images are committed to the repo so the app never calls a third party at runtime and
works offline. Re-run only when the mapping below changes:  python3 scripts/fetch_exercise_images.py
"""
import io
import pathlib
import urllib.request

from PIL import Image

BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "exercises"
WIDTH = 480

# our exercise id -> free-exercise-db id
MAPPING = {
    "push-up": "Pushups",
    "incline-push-up": "Incline_Push-Up",
    "bench-press": "Barbell_Bench_Press_-_Medium_Grip",
    "dumbbell-bench-press": "Dumbbell_Bench_Press",
    "machine-chest-press": "Machine_Bench_Press",
    "cable-fly": "Cable_Crossover",
    "pull-up": "Pullups",
    "chin-up": "Chin-Up",
    "lat-pulldown": "Wide-Grip_Lat_Pulldown",
    "barbell-row": "Bent_Over_Barbell_Row",
    "dumbbell-row": "One-Arm_Dumbbell_Row",
    "seated-cable-row": "Seated_Cable_Rows",
    "deadlift": "Barbell_Deadlift",
    "overhead-press": "Standing_Military_Press",
    "dumbbell-shoulder-press": "Dumbbell_Shoulder_Press",
    "lateral-raise": "Side_Lateral_Raise",
    "front-raise": "Front_Dumbbell_Raise",
    "shrug": "Dumbbell_Shrug",
    "dumbbell-curl": "Dumbbell_Bicep_Curl",
    "barbell-curl": "Barbell_Curl",
    "hammer-curl": "Hammer_Curls",
    "band-curl": "Standing_Biceps_Cable_Curl",
    "bench-dip": "Bench_Dips",
    "parallel-dip": "Dips_-_Triceps_Version",
    "overhead-triceps-extension": "Standing_Dumbbell_Triceps_Extension",
    "triceps-pushdown": "Triceps_Pushdown",
    "diamond-push-up": "Push-Ups_-_Close_Triceps_Position",
    "bodyweight-squat": "Bodyweight_Squat",
    "goblet-squat": "Goblet_Squat",
    "barbell-squat": "Barbell_Full_Squat",
    "lunge": "Bodyweight_Walking_Lunge",
    "bulgarian-split-squat": "Split_Squat_with_Dumbbells",
    "leg-press": "Leg_Press",
    "leg-extension": "Leg_Extensions",
    "leg-curl": "Seated_Leg_Curl",
    "romanian-deadlift": "Romanian_Deadlift",
    "glute-bridge": "Butt_Lift_Bridge",
    "hip-thrust": "Barbell_Hip_Thrust",
    "kettlebell-swing": "One-Arm_Kettlebell_Swings",
    "calf-raise": "Standing_Calf_Raises",
    "plank": "Plank",
    "crunch": "Crunches",
    "lying-leg-raise": "Flat_Bench_Lying_Leg_Raise",
    "mountain-climber": "Mountain_Climbers",
    "jumping-jack": "Star_Jump",
    "high-knees": "Jogging_Treadmill",
    "jump-rope": "Rope_Jumping",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for ours, theirs in MAPPING.items():
        for frame in (0, 1):
            dest = OUT / f"{ours}-{frame}.webp"
            if dest.exists():
                continue
            with urllib.request.urlopen(f"{BASE}/{theirs}/{frame}.jpg", timeout=30) as res:
                img = Image.open(io.BytesIO(res.read())).convert("RGB")
            img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
            img.save(dest, "WEBP", quality=72, method=6)
            print("saved", dest.name, dest.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
