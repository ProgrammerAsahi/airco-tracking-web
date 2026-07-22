import { useEffect, useRef } from "react";
import type { LandingCopy } from "./LandingPage";

type LandingCinemaProps = {
  copy: LandingCopy;
  showSubscribeNotice: boolean;
  onCta: () => void;
};

type CopyWindow = {
  ref: { current: HTMLElement | null };
  fadeIn: [number, number];
  fadeOut: [number, number] | null;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

// Segment helpers for the single global timeline (0 → 1 over the section).
function seg(progress: number, from: number, to: number): number {
  return clamp01((progress - from) / (to - from));
}

// The whole landing narrative plays inside one pinned stage: scrolling only
// drives the camera (zoom/pan) and layer crossfades, never moves the frame.
// Timeline:
//   0.00–0.16  hero on the Seine quay
//   0.08–0.22  push into the open window, room emerges from the same window
//   0.20–0.30  beat 1 · sweltering apartment
//   0.30–0.52  beat 2 · stock alert, cooling reveal begins
//   0.52–0.62  beat 3 · relief in the cooled room
//   0.60–0.73  pan right to the desk, tracker scene takes over
//   0.72–0.86  tracker beats · attribution + live data
//   0.86–0.95  push back toward the window behind a dark veil
//   0.90–1.00  pull out of the lit window into the blue-hour finale
export function LandingCinema({ copy, showSubscribeNotice, onCta }: LandingCinemaProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const tempValueRef = useRef<HTMLSpanElement | null>(null);
  const heroCopyRef = useRef<HTMLDivElement | null>(null);
  const heatCopyRef = useRef<HTMLElement | null>(null);
  const alertCopyRef = useRef<HTMLElement | null>(null);
  const reliefCopyRef = useRef<HTMLElement | null>(null);
  const trackerCopyRef = useRef<HTMLElement | null>(null);
  const productCopyRef = useRef<HTMLElement | null>(null);
  const finaleCopyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return undefined;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = false;
    let targetProgress = 0;
    let currentProgress = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const motionEnabled = () => !reducedMotion.matches;
    const pointerEnabled = () => finePointer.matches && motionEnabled();

    const copyWindows: CopyWindow[] = [
      // The first frame is already the hero. Starting the fade at exactly
      // zero made the copy fully transparent until the visitor scrolled.
      { ref: heroCopyRef, fadeIn: [-0.01, 0], fadeOut: [0.085, 0.135] },
      { ref: heatCopyRef, fadeIn: [0.20, 0.24], fadeOut: [0.285, 0.325] },
      { ref: alertCopyRef, fadeIn: [0.355, 0.395], fadeOut: [0.455, 0.495] },
      { ref: reliefCopyRef, fadeIn: [0.515, 0.555], fadeOut: [0.595, 0.635] },
      { ref: trackerCopyRef, fadeIn: [0.72, 0.755], fadeOut: [0.785, 0.81] },
      { ref: productCopyRef, fadeIn: [0.808, 0.835], fadeOut: [0.868, 0.895] },
      { ref: finaleCopyRef, fadeIn: [0.935, 0.975], fadeOut: null },
    ];

    const setCopyWindow = (progress: number, instant: boolean) => {
      for (const win of copyWindows) {
        const element = win.ref.current;
        if (!element) continue;
        const fadeIn = smoothStep(seg(progress, win.fadeIn[0], win.fadeIn[1]));
        const fadeOut = win.fadeOut ? smoothStep(seg(progress, win.fadeOut[0], win.fadeOut[1])) : 0;
        const opacity = fadeIn * (1 - fadeOut);
        element.style.opacity = `${opacity}`;
        element.style.transform = instant ? "none" : `translate3d(0, ${(1 - opacity) * 26}px, 0)`;
        const active = opacity > 0.5;
        element.style.pointerEvents = active ? "auto" : "none";
        element.setAttribute("aria-hidden", opacity < 0.05 ? "true" : "false");
      }
    };

    const renderTemp = (coolProgress: number) => {
      const badge = tempValueRef.current;
      if (!badge) return;
      const temp = Math.round(34 - coolProgress * 10);
      const text = `${temp}°C`;
      if (badge.textContent !== text) badge.textContent = text;
      stage.style.setProperty("--room-temp-hue", `${16 + coolProgress * 183}`);
    };

    const renderFrame = () => {
      frame = 0;
      if (!visible || document.hidden || !motionEnabled()) return;

      currentX += (targetX - currentX) * 0.09;
      currentY += (targetY - currentY) * 0.09;
      currentProgress += (targetProgress - currentProgress) * 0.09;
      const p = currentProgress;

      // ── Hero: dive into the open quayside window, fading to darkness ──
      const heroZoomRaw = smoothStep(seg(p, 0.06, 0.22));
      const heroZoom = Math.pow(heroZoomRaw, 1.35);
      stage.style.setProperty("--hero-scene-opacity", `${1 - smoothStep(seg(p, 0.19, 0.235))}`);
      stage.style.setProperty("--hero-dim", `${1 - smoothStep(seg(p, 0.17, 0.23)) * 0.62}`);
      stage.style.setProperty("--hero-image-x", `${currentX * -14}px`);
      stage.style.setProperty("--hero-image-y", `${currentY * -8 - p * 12}px`);
      stage.style.setProperty("--hero-image-scale", `${1.035 + heroZoom * 3.4}`);
      stage.style.setProperty("--hero-foreground-x", `${currentX * 22}px`);
      stage.style.setProperty("--hero-foreground-y", `${currentY * 11 - p * 16}px`);
      stage.style.setProperty("--hero-light-x", `${43 + currentX * 14}%`);
      stage.style.setProperty("--hero-light-y", `${28 + currentY * 10}%`);

      // ── Room: emerge from the same window, cool down, hold on the man ──
      const roomEnter = smoothStep(seg(p, 0.15, 0.26));
      const roomSettle = smoothStep(seg(p, 0.15, 0.28));
      const roomExit = smoothStep(seg(p, 0.62, 0.72));
      const roomGone = smoothStep(seg(p, 0.665, 0.72));
      const coolProgress = smoothStep(seg(p, 0.30, 0.50));
      const transitionMist = Math.sin(coolProgress * Math.PI) * 0.30;
      const revealOuter = coolProgress === 0 ? 0 : coolProgress * 150 + 10;
      const revealInner = Math.max(0, revealOuter - 32);
      renderTemp(coolProgress);

      stage.style.setProperty("--room-scene-opacity", `${roomEnter * (1 - roomGone)}`);
      stage.style.setProperty("--room-image-origin", `${17 + roomSettle * 25 - roomExit * 2}% ${30 + roomSettle * 21 + roomExit * 4}%`);
      stage.style.setProperty("--room-image-x", `${currentX * -12 - roomExit * 8}px`);
      stage.style.setProperty("--room-image-y", `${currentY * -7 - p * 9 - roomExit * 4}px`);
      stage.style.setProperty("--room-image-scale", `${1.075 + (1 - roomEnter) * 0.45 - p * 0.02 + roomExit * 0.1}`);
      stage.style.setProperty("--room-foreground-x", `${currentX * 18 - roomExit * 40}px`);
      stage.style.setProperty("--room-foreground-y", `${currentY * 10 - p * 7}px`);
      stage.style.setProperty("--room-light-x", `${20 + currentX * 7}%`);
      stage.style.setProperty("--room-light-y", `${33 + currentY * 6}%`);
      stage.style.setProperty("--room-hot-opacity", "1");
      stage.style.setProperty("--room-warmth-opacity", `${0.94 - coolProgress * 0.82}`);
      stage.style.setProperty("--room-cool-layer-opacity", `${Math.min(1, coolProgress * 3.2)}`);
      stage.style.setProperty("--room-cool-reveal-inner", `${revealInner}%`);
      stage.style.setProperty("--room-cool-reveal-outer", `${revealOuter}%`);
      stage.style.setProperty("--room-refraction-high-opacity", `${0.075 * (1 - coolProgress)}`);
      stage.style.setProperty("--room-refraction-low-opacity", `${0.055 * (1 - coolProgress)}`);
      stage.style.setProperty("--room-dust-opacity", `${0.76 * (1 - coolProgress)}`);
      stage.style.setProperty("--room-still-opacity", `${0.34 * (1 - coolProgress)}`);
      stage.style.setProperty("--room-airflow-opacity", `${Math.max(0, (coolProgress - 0.18) / 0.82)}`);
      stage.style.setProperty("--room-cooling-opacity", `${coolProgress * 0.46}`);
      stage.style.setProperty("--room-transition-mist-opacity", `${transitionMist}`);
      stage.style.setProperty("--room-cool-wave-x", `${(1 - coolProgress) * -18}px`);

      // ── Tracker: dissolve in tight on the man, zoom out to reveal the
      // desk (laptop + phone), then push hard at the window to leave ─────
      const trackerEnter = smoothStep(seg(p, 0.66, 0.72));
      const trackerReveal = smoothStep(seg(p, 0.72, 0.85));
      const trackerExit = smoothStep(seg(p, 0.86, 0.95));
      const trackerGone = smoothStep(seg(p, 0.91, 0.96));
      const local = seg(p, 0.76, 0.88);
      const laptopFocus = smoothStep((local - 0.18) / 0.54);
      const phoneFocus = 1 - smoothStep((local - 0.30) / 0.34) * 0.72;

      stage.style.setProperty("--tracker-scene-opacity", `${trackerEnter * (1 - trackerGone)}`);
      stage.style.setProperty("--tracker-image-origin", `${40 + trackerReveal * 14 - trackerExit * 37}% ${52 - trackerExit * 22}%`);
      stage.style.setProperty("--tracker-image-x", `${currentX * -10 - local * 6 - trackerExit * 30}px`);
      stage.style.setProperty("--tracker-image-y", `${currentY * -6 - local * 4 + trackerExit * 18}px`);
      stage.style.setProperty("--tracker-image-scale", `${1.55 - trackerReveal * 0.495 + trackerExit * 0.8}`);
      stage.style.setProperty("--tracker-foreground-x", `${currentX * 18}px`);
      stage.style.setProperty("--tracker-foreground-y", `${currentY * 10}px`);
      stage.style.setProperty("--tracker-phone-focus", `${phoneFocus * trackerEnter}`);
      stage.style.setProperty("--tracker-laptop-focus", `${laptopFocus * trackerEnter}`);
      stage.style.setProperty("--tracker-country-opacity", `${smoothStep((local - 0.48) / 0.10)}`);
      stage.style.setProperty("--tracker-stock-opacity", `${smoothStep((local - 0.56) / 0.10)}`);
      stage.style.setProperty("--tracker-retailer-opacity", `${smoothStep((local - 0.64) / 0.10)}`);
      stage.style.setProperty("--tracker-model-opacity", `${smoothStep((local - 0.72) / 0.10)}`);
      stage.style.setProperty("--tracker-price-opacity", `${smoothStep((local - 0.80) / 0.10)}`);
      stage.style.setProperty("--tracker-exit-opacity", `${trackerExit * 0.9}`);

      // ── Finale: pull out of the lit window into the blue hour ─────────
      const finaleEnter = smoothStep(seg(p, 0.91, 0.96));
      const finalePull = smoothStep(seg(p, 0.91, 0.995));
      stage.style.setProperty("--finale-scene-opacity", `${finaleEnter}`);
      stage.style.setProperty("--finale-image-origin", `${86 - finalePull * 28}% ${44 + finalePull * 8}%`);
      stage.style.setProperty("--finale-image-x", `${currentX * -12}px`);
      stage.style.setProperty("--finale-image-y", `${currentY * -7 - finalePull * 6}px`);
      stage.style.setProperty("--finale-image-scale", `${1.035 + (1 - finalePull) * 1.2 + finalePull * 0.012}`);
      stage.style.setProperty("--finale-foreground-x", `${currentX * 18}px`);
      stage.style.setProperty("--finale-foreground-y", `${currentY * 9}px`);
      stage.style.setProperty("--finale-light-x", `${82 + currentX * 5}%`);
      stage.style.setProperty("--finale-light-y", `${42 + currentY * 5}%`);
      stage.style.setProperty("--finale-glint-opacity", `${0.26 + finalePull * 0.38}`);

      // ── HUD: alert chip (tracker screen only), beat dots, temperature ──
      stage.style.setProperty("--cinema-chip-opacity", `${smoothStep(seg(p, 0.72, 0.76)) * (1 - smoothStep(seg(p, 0.84, 0.88)))}`);
      const dot = p < 0.16 ? 0 : p < 0.30 ? 1 : p < 0.60 ? 2 : p < 0.90 ? 3 : 4;
      if (stage.dataset.dot !== String(dot)) stage.dataset.dot = String(dot);

      setCopyWindow(p, false);

      const stillMoving = Math.abs(targetX - currentX) > 0.001
        || Math.abs(targetY - currentY) > 0.001
        || Math.abs(targetProgress - currentProgress) > 0.001;
      if (stillMoving) frame = window.requestAnimationFrame(renderFrame);
    };

    const scheduleFrame = () => {
      if (!frame && visible && !document.hidden && motionEnabled()) {
        frame = window.requestAnimationFrame(renderFrame);
      }
    };

    // Reduced motion: jump straight to the act's staged frame — no camera
    // moves, no crossfades, copy swaps with a plain cut.
    const ACTS = ["hero", "heat", "alert", "relief", "tracker", "finale"];
    const applyAct = (progress: number) => {
      const act = progress < 0.16 ? 0 : progress < 0.30 ? 1 : progress < 0.50 ? 2 : progress < 0.62 ? 3 : progress < 0.90 ? 4 : 5;
      if (stage.dataset.act !== ACTS[act]) stage.dataset.act = ACTS[act];
      const dot = progress < 0.16 ? 0 : progress < 0.30 ? 1 : progress < 0.62 ? 2 : progress < 0.90 ? 3 : 4;
      if (stage.dataset.dot !== String(dot)) stage.dataset.dot = String(dot);
      renderTemp(smoothStep(seg(progress, 0.30, 0.50)));
      const actCopy = [heroCopyRef, heatCopyRef, alertCopyRef, reliefCopyRef, trackerCopyRef, finaleCopyRef];
      actCopy.forEach((ref, index) => {
        const element = ref.current;
        if (!element) return;
        const active = index === act;
        element.style.opacity = active ? "1" : "0";
        element.style.transform = "none";
        element.style.pointerEvents = active ? "auto" : "none";
        element.setAttribute("aria-hidden", active ? "false" : "true");
      });
      if (productCopyRef.current) {
        productCopyRef.current.style.opacity = "0";
        productCopyRef.current.style.pointerEvents = "none";
        productCopyRef.current.setAttribute("aria-hidden", "true");
      }
    };

    const updateScrollTarget = () => {
      const rect = section.getBoundingClientRect();
      const distance = Math.max(rect.height - window.innerHeight, 1);
      targetProgress = clamp01(-rect.top / distance);
      if (!motionEnabled()) {
        applyAct(targetProgress);
        return;
      }
      scheduleFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerEnabled()) return;
      const rect = stage.getBoundingClientRect();
      targetX = Math.min(0.5, Math.max(-0.5, (event.clientX - rect.left) / rect.width - 0.5));
      targetY = Math.min(0.5, Math.max(-0.5, (event.clientY - rect.top) / window.innerHeight - 0.5));
      scheduleFrame();
    };

    const handlePointerLeave = () => {
      targetX = 0;
      targetY = 0;
      scheduleFrame();
    };

    const handlePreferenceChange = () => {
      if (!motionEnabled()) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        targetX = 0;
        targetY = 0;
        currentX = 0;
        currentY = 0;
        applyAct(targetProgress);
        return;
      }
      delete stage.dataset.act;
      if (!finePointer.matches) {
        targetX = 0;
        targetY = 0;
      }
      updateScrollTarget();
    };

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) updateScrollTarget();
      else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { threshold: 0.01 });

    intersectionObserver.observe(section);
    stage.addEventListener("pointermove", handlePointerMove, { passive: true });
    stage.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", updateScrollTarget, { passive: true });
    window.addEventListener("resize", updateScrollTarget, { passive: true });
    document.addEventListener("visibilitychange", updateScrollTarget);
    finePointer.addEventListener("change", handlePreferenceChange);
    reducedMotion.addEventListener("change", handlePreferenceChange);
    // Paint the copy for the restored scroll position synchronously. The
    // IntersectionObserver callback is asynchronous, so relying on its first
    // notification can leave the zero-scroll hero at opacity 0 for a frame (or
    // indefinitely in constrained/test environments).
    updateScrollTarget();
    currentProgress = targetProgress;
    if (motionEnabled()) setCopyWindow(currentProgress, true);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      stage.removeEventListener("pointermove", handlePointerMove);
      stage.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", updateScrollTarget);
      window.removeEventListener("resize", updateScrollTarget);
      document.removeEventListener("visibilitychange", updateScrollTarget);
      finePointer.removeEventListener("change", handlePreferenceChange);
      reducedMotion.removeEventListener("change", handlePreferenceChange);
    };
  }, []);

  return (
    <section ref={sectionRef} className="landing-cinema" aria-label={copy.navStory}>
      <div ref={stageRef} className="landing-cinema-stage" data-dot="0">
        <div className="landing-cinema-layer landing-cinema-layer--hero" aria-hidden="true">
          <div className="landing-hero-visual">
            <picture className="landing-hero-picture">
              <source media="(max-width: 640px)" srcSet="/media/hero-seine-heatwave-v1-mobile.jpg" />
              <img className="landing-hero-image" src="/media/hero-seine-heatwave-v1.jpg" width="1672" height="941" loading="eager" decoding="async" fetchPriority="high" alt="" />
            </picture>
            <div className="landing-hero-color-wash" />
            <div className="landing-hero-sun-bloom" />
            <div className="landing-hero-refraction landing-hero-refraction--high" />
            <div className="landing-hero-refraction landing-hero-refraction--low" />
            <div className="landing-hero-river-glints"><i /><i /><i /><i /></div>
            <div className="landing-hero-particles"><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="landing-hero-scrim" />
            <div className="landing-hero-depth-frame" />
          </div>
        </div>

        <div className="landing-cinema-layer landing-cinema-layer--room" aria-hidden="true">
          <div className="landing-room-scene">
            <picture className="landing-room-scene-picture landing-room-scene-picture--hot">
              <source media="(max-width: 640px)" srcSet="/media/room-paris-heatwave-v2-mobile.jpg" />
              <img className="landing-room-scene-image" src="/media/room-paris-heatwave-v1.jpg" width="1672" height="941" loading="lazy" decoding="async" alt="" />
            </picture>
            <picture className="landing-room-scene-picture landing-room-scene-picture--cool">
              <source media="(max-width: 640px)" srcSet="/media/room-paris-cooled-portasplit-v1-mobile.jpg" />
              <img className="landing-room-scene-image" src="/media/room-paris-cooled-portasplit-v1.jpg" width="1672" height="941" loading="lazy" decoding="async" alt="" />
            </picture>
            <div className="landing-room-scene-cool-motion">
              <i className="landing-room-scene-cool-motion-curtain" />
              <i className="landing-room-scene-cool-motion-plant" />
            </div>
            <div className="landing-room-scene-warmth" />
            <div className="landing-room-scene-sunbeam" />
            <div className="landing-room-scene-refraction landing-room-scene-refraction--high" />
            <div className="landing-room-scene-refraction landing-room-scene-refraction--low" />
            <div className="landing-room-scene-dust"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="landing-room-scene-still-air"><i /><i /><i /></div>
            <div className="landing-room-scene-transition-mist" />
            <div className="landing-room-scene-cooling" />
            <div className="landing-room-scene-airflow"><i /><i /><i /></div>
            <div className="landing-room-scene-scrim" />
            <div className="landing-room-scene-depth" />
            <div className="landing-room-temp">
              <span ref={tempValueRef} className="landing-room-temp-value">34°C</span>
              <span className="landing-room-temp-label">{copy.roomTempLabel}</span>
            </div>
          </div>
        </div>

        <div className="landing-cinema-layer landing-cinema-layer--tracker" aria-hidden="true">
          <div className="landing-tracker-scene">
            <picture className="landing-tracker-scene-picture">
              <img className="landing-tracker-scene-image" src="/media/room-paris-tracker-v1.jpg" width="1672" height="941" loading="lazy" decoding="async" alt="" />
            </picture>
            <div className="landing-tracker-scene-cool-wash" />
            <div className="landing-tracker-scene-window-light" />
            <div className="landing-tracker-scene-phone-focus" />
            <div className="landing-tracker-scene-laptop-focus" />
            <div className="landing-tracker-scene-glints"><i /><i /><i /></div>
            <div className="landing-tracker-scene-scrim" />
            <div className="landing-tracker-scene-depth" />
            <div className="landing-tracker-scene-exit" />
          </div>
          <div className="landing-tracker-data-rail" aria-hidden="true">
            <span className="landing-tracker-data-label">{copy.trackerOverviewLabel}</span>
            <div className="landing-tracker-data-card landing-tracker-data-card--country">
              <span>{copy.trackerCountryLabel}</span>
              <strong><i aria-hidden="true">FR</i>{copy.trackerCountryValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--stock">
              <span>{copy.trackerAvailabilityLabel}</span>
              <strong>{copy.trackerAvailabilityValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--retailer">
              <span>{copy.trackerRetailerLabel}</span>
              <strong>{copy.trackerRetailerValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--model">
              <span>{copy.trackerModelLabel}</span>
              <strong>{copy.trackerModelValue}</strong>
            </div>
            <div className="landing-tracker-data-card landing-tracker-data-card--price">
              <span>{copy.trackerPriceLabel}</span>
              <strong>{copy.trackerPriceValue}</strong>
            </div>
          </div>
        </div>

        <div className="landing-cinema-layer landing-cinema-layer--finale" aria-hidden="true">
          <div className="landing-finale-visual">
            <picture className="landing-finale-picture">
              <img className="landing-finale-image" src="/media/seine-blue-hour-portasplit-v1.jpg" width="1672" height="941" loading="lazy" decoding="async" alt="" />
            </picture>
            <div className="landing-finale-color-wash" />
            <div className="landing-finale-window-glow" />
            <div className="landing-finale-river-glints"><i /><i /><i /><i /></div>
            <div className="landing-finale-scrim" />
            <div className="landing-finale-depth" />
          </div>
        </div>

        <div className="landing-cinema-chip" aria-hidden="true">
          <span className="landing-story-alert-chip-icon" aria-hidden="true">✦</span>
          <div>
            <span>{copy.trackerAlertStatus}</span>
            <strong>{copy.trackerAlertSubject}</strong>
            <small>Rue du Commerce · {copy.trackerPriceValue}</small>
          </div>
        </div>

        <div className="landing-cinema-dots" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </div>

        <div className="landing-cinema-copy landing-cinema-copy--hero" ref={heroCopyRef}>
          <div className="landing-hero-copy">
            <p className="landing-kicker">{copy.heroEyebrow}</p>
            <h1 id="landing-title">{renderLandingLines(copy.heroTitle)}</h1>
            <p>{copy.heroLead}</p>
            <div className="landing-hero-actions">
              <button className="landing-primary-button" type="button" onClick={onCta}>
                {copy.primaryCta}
              </button>
            </div>
            <div className="landing-hero-meta" aria-label={copy.statusLabel}>
              <span>{copy.statSites}</span>
              <span>{copy.statCountries}</span>
              <span>{copy.statRefresh}</span>
            </div>
          </div>
          <div className="landing-scroll-cue">
            <span aria-hidden="true" />
            {copy.scrollCue}
          </div>
        </div>

        <article className="landing-cinema-copy landing-cinema-copy--beat landing-cinema-copy--right" ref={heatCopyRef}>
          <div className="landing-cinema-card">
            <p className="landing-kicker">{copy.storyHeatKicker}</p>
            <h2>{renderLandingLines(copy.storyHeatTitle)}</h2>
            <p>{copy.storyHeatBody}</p>
          </div>
        </article>

        <article className="landing-cinema-copy landing-cinema-copy--beat landing-cinema-copy--right" ref={alertCopyRef}>
          <div className="landing-cinema-card landing-cinema-card--alert">
            <p className="landing-kicker">{copy.storyAlertKicker}</p>
            <h2>{renderLandingLines(copy.storyAlertTitle)}</h2>
            <p>{copy.storyAlertBody}</p>
          </div>
        </article>

        <article className="landing-cinema-copy landing-cinema-copy--beat landing-cinema-copy--right" ref={reliefCopyRef}>
          <div className="landing-cinema-card landing-cinema-card--relief">
            <p className="landing-kicker">{copy.storyReliefKicker}</p>
            <h2>{renderLandingLines(copy.storyReliefTitle)}</h2>
            <p>{renderLandingLines(copy.storyReliefBody)}</p>
            <button className="landing-primary-button" type="button" onClick={onCta}>
              {copy.primaryCta}
            </button>
          </div>
        </article>

        <article className="landing-cinema-copy landing-cinema-copy--beat landing-cinema-copy--left" ref={trackerCopyRef}>
          <div className="landing-cinema-card landing-cinema-card--tracker">
            <p className="landing-kicker">{copy.stepFourAlertKicker}</p>
            <h2>{renderLandingLines(copy.stepFourAlertTitle)}</h2>
            <p>{copy.stepFourAlertBody}</p>
          </div>
        </article>

        <article className="landing-cinema-copy landing-cinema-copy--beat landing-cinema-copy--left" ref={productCopyRef}>
          <div className="landing-cinema-card landing-cinema-card--tracker">
            <p className="landing-kicker">{copy.productKicker}</p>
            <h2>{renderLandingLines(copy.productTitle)}</h2>
            <p>{copy.productBody}</p>
            <button className="landing-primary-button" type="button" onClick={onCta}>
              {copy.primaryCta}
            </button>
          </div>
        </article>

        <div className="landing-cinema-copy landing-cinema-copy--finale" ref={finaleCopyRef}>
          <div className="landing-finale-copy">
            <p className="landing-kicker">{copy.finaleKicker}</p>
            <h2>{renderLandingLines(copy.subscribeTitle)}</h2>
            <p>{copy.subscribeBody}</p>
            {showSubscribeNotice && <p className="landing-subscribe-note">{copy.subscribeNotice}</p>}
            <button className="landing-primary-button landing-primary-button--large" type="button" onClick={onCta}>
              {copy.primaryCta}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function renderLandingLines(value: string) {
  return value.split(/<br\s*\/?>/i).map((line, index) => (
    <span className="landing-title-line" key={`${index}-${line}`}>
      {line}
    </span>
  ));
}
