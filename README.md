# yadkoyi.com

Personal site of **Yad Soran Tawfeeq**, a software and network & infrastructure engineer based in Erbil.

A static, dependency-free site (no build step) with:

- A full-screen **Three.js** particle stage. It morphs between 3D shapes as you scroll: sphere → torus knot → network mesh → double helix → stacked Raspberry Pi cluster → galaxy → orbit ring.
- Apple-style **GSAP ScrollTrigger** choreography: pinned word-by-word statement, horizontal pinned card scroll, a timeline that draws itself, a pinned featured-project story, scroll-driven marquees and counters.
- **Lenis** smooth scrolling, 3D hover tilt on cards, and full mobile responsiveness.
- Respects `prefers-reduced-motion`, and falls back to a static background if WebGL is unavailable.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(It must be served over HTTP; opening `index.html` directly will block the ES module.)

## Structure

```
index.html            content & sections
assets/css/styles.css styles + responsive breakpoints
assets/js/main.js     3D scene, shape generators, scroll animations
assets/vendor/        three 0.160.0, gsap 3.12.5 (+ScrollTrigger), lenis 1.1.13
```

## Deploy

Any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages). For GitHub Pages, enable Pages on the `main` branch root and add a `CNAME` file containing `yadkoyi.com`.
