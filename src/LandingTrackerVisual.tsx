import { useEffect, useRef } from "react";

const MOTION_PROPERTIES = [
  "--tracker-image-x",
  "--tracker-image-y",
  "--tracker-image-scale",
  "--tracker-foreground-x",
  "--tracker-foreground-y",
  "--tracker-phone-focus",
  "--tracker-laptop-focus",
  "--tracker-alert-opacity",
  "--tracker-country-opacity",
  "--tracker-stock-opacity",
  "--tracker-retailer-opacity",
  "--tracker-model-opacity",
  "--tracker-price-opacity",
  "--tracker-entry-opacity",
] as const;

function smoothStep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function LandingTrackerVisual() {
  const visualRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const visual = visualRef.current;
    const story = visual?.closest<HTMLElement>(".landing-product-story");
    if (!visual || !story) return undefined;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let targetX = 0;
    let targetY = 0;
    let targetProgress = 0;
    let currentX = 0;
    let currentY = 0;
    let currentProgress = 0;

    const motionEnabled = () => !reducedMotion.matches;
    const pointerEnabled = () => finePointer.matches && motionEnabled();

    const clearMotionStyles = () => {
      MOTION_PROPERTIES.forEach((property) => story.style.removeProperty(property));
    };

    const renderFrame = () => {
      frame = 0;
      if (!visible || document.hidden || !motionEnabled()) return;

      currentX += (targetX - currentX) * 0.09;
      currentY += (targetY - currentY) * 0.09;
      currentProgress += (targetProgress - currentProgress) * 0.1;

      const progress = Math.min(1, Math.max(0, currentProgress));
      const laptopFocus = smoothStep((progress - 0.18) / 0.54);
      const phoneFocus = 1 - smoothStep((progress - 0.30) / 0.34) * 0.72;
      const alertOpacity = 1 - smoothStep((progress - 0.26) / 0.14);

      story.style.setProperty("--tracker-image-x", `${currentX * -10 - progress * 10}px`);
      story.style.setProperty("--tracker-image-y", `${currentY * -6 - progress * 8}px`);
      story.style.setProperty("--tracker-image-scale", `${1.055 - progress * 0.025}`);
      story.style.setProperty("--tracker-foreground-x", `${currentX * 18}px`);
      story.style.setProperty("--tracker-foreground-y", `${currentY * 10}px`);
      story.style.setProperty("--tracker-phone-focus", `${phoneFocus}`);
      story.style.setProperty("--tracker-laptop-focus", `${laptopFocus}`);
      story.style.setProperty("--tracker-alert-opacity", `${alertOpacity}`);
      story.style.setProperty("--tracker-country-opacity", `${smoothStep((progress - 0.48) / 0.10)}`);
      story.style.setProperty("--tracker-stock-opacity", `${smoothStep((progress - 0.56) / 0.10)}`);
      story.style.setProperty("--tracker-retailer-opacity", `${smoothStep((progress - 0.64) / 0.10)}`);
      story.style.setProperty("--tracker-model-opacity", `${smoothStep((progress - 0.72) / 0.10)}`);
      story.style.setProperty("--tracker-price-opacity", `${smoothStep((progress - 0.80) / 0.10)}`);
      // Cool wash carried over from the relieved apartment scene, fading
      // out as the tracker section scrolls in.
      story.style.setProperty("--tracker-entry-opacity", `${Math.max(0, 0.62 - progress * 2.6)}`);

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

    const updateScrollTarget = () => {
      const rect = story.getBoundingClientRect();
      const distance = Math.max(rect.height - window.innerHeight, 1);
      targetProgress = Math.min(1, Math.max(0, -rect.top / distance));
      scheduleFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerEnabled()) return;
      const rect = story.getBoundingClientRect();
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
        targetProgress = 0;
        currentX = 0;
        currentY = 0;
        currentProgress = 0;
        clearMotionStyles();
        return;
      }
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

    intersectionObserver.observe(story);
    story.addEventListener("pointermove", handlePointerMove, { passive: true });
    story.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", updateScrollTarget, { passive: true });
    window.addEventListener("resize", updateScrollTarget, { passive: true });
    document.addEventListener("visibilitychange", updateScrollTarget);
    finePointer.addEventListener("change", handlePreferenceChange);
    reducedMotion.addEventListener("change", handlePreferenceChange);
    updateScrollTarget();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      story.removeEventListener("pointermove", handlePointerMove);
      story.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", updateScrollTarget);
      window.removeEventListener("resize", updateScrollTarget);
      document.removeEventListener("visibilitychange", updateScrollTarget);
      finePointer.removeEventListener("change", handlePreferenceChange);
      reducedMotion.removeEventListener("change", handlePreferenceChange);
      clearMotionStyles();
    };
  }, []);

  return (
    <div ref={visualRef} className="landing-tracker-scene" aria-hidden="true">
      <picture className="landing-tracker-scene-picture">
        <img
          className="landing-tracker-scene-image"
          src="/media/room-paris-tracker-v1.jpg"
          width="1672"
          height="941"
          loading="lazy"
          decoding="async"
          alt=""
        />
      </picture>
      <div className="landing-tracker-scene-cool-wash" />
      <div className="landing-tracker-scene-window-light" />
      <div className="landing-tracker-scene-phone-focus" />
      <div className="landing-tracker-scene-laptop-focus" />
      <div className="landing-tracker-scene-glints"><i /><i /><i /></div>
      <div className="landing-tracker-scene-scrim" />
      <div className="landing-tracker-scene-depth" />
      <div className="landing-tracker-scene-entry-wash" />
    </div>
  );
}
