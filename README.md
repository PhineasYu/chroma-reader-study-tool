# Chroma Reader

Build a web app called Chroma Reader — a study tool that color-codes 

long text by the reader's mastery level.

Stack: React + TypeScript, Lovable Cloud for backend.

Screen 1 — Import: a large textarea where the user pastes text, 

plus a title field and an "Analyze" button.

Screen 2 — Reader: displays the text split into sentences. Each 

sentence is a span with a background highlight color. Text stays 

dark and readable — color is background only, with 3px rounded 

corners and light padding. Line-height 2, max-width 680px, 

centered, serif body font, generous margins. Editorial reading 

feel, like a well-set book page — not a dashboard.

Color system, exactly 5:

1 green  = got it

2 amber  = shaky

3 red    = don't get it

4 blue   = key idea

5 gray   = skip

Interaction: clicking a sentence selects it. Pressing keys 1-5 

assigns that color instantly and moves selection to the next 

sentence. This must feel fast — no menus, no modals.

A slim fixed toolbar at top shows the 5 colors with their labels 

and number shortcuts.

Backend: table `documents` (id, title, raw_text, created_at) and 

table `segments` (id, doc_id, order_index, text, ai_label, 

user_color). Sentence splitting happens in the frontend before 

saving. Rendering reads user_color first, falls back to ai_label.

For now, leave ai_label empty — no AI yet.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://chroma-reader-study-tool.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f520ac64-2108-4e6a-87ec-540601b2a0e4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
