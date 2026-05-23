# Project Instructions

## Language Policy

Use English only throughout this project.

This applies to:

- User-facing UI text.
- Browser alerts, prompts, buttons, labels, and validation messages.
- Documentation and README files.
- Code comments and inline developer notes.
- Script output and command-line prompts.
- Commit messages, pull request titles, pull request descriptions, and issue text.
- Generated example data, unless the Leica data format explicitly requires another language.

Do not add Russian or any other non-English text to project files.

## Development Notes

- Keep the app usable as a local browser-based Leica point renamer unless a task explicitly introduces a backend.
- Keep `Punkt-Name-Changer.html` self-contained for mobile field use.
- Keep the split version in `index.html`, `css/`, and `js/` aligned with the single-file version after logic changes.
- Preserve `.imes`, `.ipkt`, `.iroh`, `.lqp`, and TXT export workflows.
- Preserve original file formatting and field alignment when renaming point IDs.
- Keep coordinate validation strict: candidate Y and X values must match the master within 0.05 m.
- Keep MQ numbering based on the original point pair index, so partial measurements with skipped point ranges keep their real MQ positions.
- Update project documentation after each functional change.
- Run `python tests/run_validation.py` after every functional update.
- After each functional update, commit the changes and push the updated project to GitHub.
- Do not leave completed project changes only in the local working tree unless the user explicitly asks to pause before publishing.
- Keep comments and developer notes concise, accurate, and in English.
