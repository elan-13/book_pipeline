#!/usr/bin/env python3
"""
═════════════════════════════════════════════════════════════════════════
  Local CI/CD Runner — Automated Test Suite & Validation Harness
  Simulates GitHub Actions CI pipeline locally for data engineering teams.
═════════════════════════════════════════════════════════════════════════

Usage:
    python run_ci.py
"""

import os
import sys
import time
import subprocess
from pathlib import Path

# Force UTF-8 stdout encoding for Windows standard streams
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent

def print_header(title: str):
    print("\n" + "=" * 70)
    print(f"  🚀  {title}")
    print("=" * 70)

def print_step(name: str):
    print(f"\n▶ [{time.strftime('%H:%M:%S')}] RUNNING STAGE: {name}...")

def run_command(cmd: list[str], stage_name: str) -> bool:
    print_step(stage_name)
    start_t = time.time()
    result = subprocess.run(cmd, cwd=str(BASE_DIR))
    elapsed = round(time.time() - start_t, 2)
    if result.returncode == 0:
        print(f"✅ [{time.strftime('%H:%M:%S')}] STAGE PASSED: {stage_name} ({elapsed}s)")
        return True
    else:
        print(f"❌ [{time.strftime('%H:%M:%S')}] STAGE FAILED: {stage_name} (exit code: {result.returncode})")
        return False

def main():
    print_header("DATA ENGINEERING CI/CD LOCAL TEST RUNNER")
    print(f"  Working Directory : {BASE_DIR}")
    print(f"  Python Version    : {sys.version.split()[0]}")
    print(f"  Environment       : {os.getenv('APP_ENV', 'development')}")

    stages = [
        ("Python Syntax & Compilation Check", [sys.executable, "-m", "py_compile", "pipeline/batch_pipeline.py", "app.py", "config/pipeline_config.py"]),
        ("Configuration as Code Validation", [sys.executable, "-c", "from config import load_config; cfg = load_config(); assert len(cfg['endpoints']) > 0, 'Endpoints config empty'; print('Config validated successfully.')"]),
        ("Unit Tests (Transformation Logic)", [sys.executable, "-m", "pytest", "tests/test_transformations.py", "-v", "-m", "unit"]),
        ("Mock Tests (API & Database Boundaries)", [sys.executable, "-m", "pytest", "tests/test_mock_pipeline.py", "-v", "-m", "mock"]),
        ("Data Quality & Schema Validation Gates", [sys.executable, "-m", "pytest", "tests/test_data_quality.py", "-v", "-m", "quality"]),
        ("Full Test Suite Execution", [sys.executable, "-m", "pytest", "tests/", "--tb=short"]),
    ]

    total_start = time.time()
    failed_stages = []

    for name, cmd in stages:
        success = run_command(cmd, name)
        if not success:
            failed_stages.append(name)
            break

    total_elapsed = round(time.time() - total_start, 2)
    print("\n" + "=" * 70)
    if not failed_stages:
        print(f"🎉  ALL CI/CD STAGES PASSED SUCCESSFULLY in {total_elapsed}s!")
        print("    Code is verified and ready for Git commit and GitHub Actions deployment.")
        print("=" * 70 + "\n")
        return 0
    else:
        print(f"💥  CI/CD PIPELINE FAILED at stage: '{failed_stages[0]}'")
        print(f"    Please fix the issues above before pushing to GitHub.")
        print("=" * 70 + "\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
