# Infinite Bubble Popper 🫧
A relaxing, infinite bubble-popping game with pixel art aesthetics and 3 cute themes! Pop bubbles as they float upward in a never-ending stream.
<video src="https://github.com/user-attachments/assets/14fc3cbe-0d87-4efb-814a-27a2319bd395" controls></video>
## Themes

- **Sea** 🐚 — Ocean background with seashell-shaped bubbles
- **Night Sky** ⭐ — Starry sky background with star-shaped bubbles
- **Jungle** 🐻 — Forest background with bear-shaped bubbles

## Features

- Infinite bubble stream floating from bottom to top
- Click/tap to pop bubbles with particle effects & sound
- Pixelated UI using Pixelify Sans font
- Progressive difficulty — speed and spawn rate increase every 10 pops
- High score persistence via localStorage
- Theme switcher (dropdown, top-right)
- Mobile-friendly with touch support
- Built with HTML Canvas + Howler.js + Electron

## Setup

```bash
npm install
```

### Assets

Place the following PNG files in the `assets/` folder:

- `Sea_Theme.png` — Sea background
- `Nightsky_Theme.png` — Night sky background
- `Jungle_Theme.png` — Jungle background
- `Seashell_Bubble.png` — Seashell bubble sprite
- `Star_Bubble.png` — Star bubble sprite
- `Bear_Bubble.png` — Bear bubble sprite
- `Bubbles_Icon.png` — App icon

### Run

```bash
npm start
```

## Tech Stack

- **Electron** — Desktop app shell
- **HTML Canvas** — Game rendering
- **Howler.js** — Audio (synthesized pop sound)
- **Pixelify Sans** — Pixel-style Google Font
