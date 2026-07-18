import { useEffect, useRef } from "react";

const MOTION_PROPERTIES = [
  "--finale-image-x",
  "--finale-image-y",
  "--finale-image-scale",
  "--finale-image-origin",
  "--finale-foreground-x",
  "--finale-foreground-y",
  "--finale-light-x",
  "--finale-light-y",
  "--finale-glint-opacity",
  "--finale-entry-opacity",
] as const;

export function LandingFinaleVisual() {
  const visualRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const visual = visualRef.current;
    const finale = visual?.closest<HTMLElement>(".landing-finale");
    if (!visual || !finale) return undefined;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = false;
    let targetX = 0;
    let targetY = 0;
    let targetProgress = 0;
    let currentX = 0;
    let currentY = 0;
    let currentProgress = 0;

    const motionEnabled = () => !reducedMotion.matches;
    const pointerEnabled = () => finePointer.matches && motionEnabled();

    const clearMotionStyles = () => {
      MOTION_PROPERTIES.forEach((property) => finale.style.removeProperty(property));
    };

    const renderFrame = () => {
      frame = 0;
      if (!visible || document.hidden || !motionEnabled()) return;

      currentX += (targetX - currentX) * 0.085;
      currentY += (targetY - currentY) * 0.085;
      currentProgress += (targetProgress - currentProgress) * 0.08;

      // Camera pull-back: open inside the lit apartment window (continuing
      // the tracker scene's push toward it) and drift out to the full
      // blue-hour panorama as the section scrolls in.
      const entryLinear = Math.min(1, Math.max(0, currentProgress / 0.22));
      const entryP = entryLinear * entryLinear * (3 - 2 * entryLinear);
      const originX = 86 - entryP * 36;
      const originY = 44 + entryP * 6;

      finale.style.setProperty("--finale-image-origin", `${originX}% ${originY}%`);
      finale.style.setProperty("--finale-image-x", `${currentX * -12}px`);
      finale.style.setProperty("--finale-image-y", `${currentY * -7 - currentProgress * 9}px`);
      finale.style.setProperty("--finale-image-scale", `${1.035 + currentProgress * 0.012 + (1 - entryP) * 0.5}`);
      finale.style.setProperty("--finale-entry-opacity", `${(1 - entryP) * 0.88}`);
      finale.style.setProperty("--finale-foreground-x", `${currentX * 18}px`);
      finale.style.setProperty("--finale-foreground-y", `${currentY * 9}px`);
      finale.style.setProperty("--finale-light-x", `${82 + currentX * 5}%`);
      finale.style.setProperty("--finale-light-y", `${42 + currentY * 5}%`);
      finale.style.setProperty("--finale-glint-opacity", `${0.26 + currentProgress * 0.38}`);

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
      const rect = finale.getBoundingClientRect();
      const travel = Math.max(window.innerHeight + rect.height, 1);
      targetProgress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / travel));
      scheduleFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerEnabled()) return;
      const rect = finale.getBoundingClientRect();
      targetX = Math.min(0.5, Math.max(-0.5, (event.clientX - rect.left) / rect.width - 0.5));
      targetY = Math.min(0.5, Math.max(-0.5, (event.clientY - rect.top) / rect.height - 0.5));
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
      finale.classList.toggle("landing-finale--visible", Boolean(entry && entry.intersectionRatio >= 0.2));
      if (visible) updateScrollTarget();
      else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { threshold: [0.01, 0.2, 0.45] });

    intersectionObserver.observe(finale);
    finale.addEventListener("pointermove", handlePointerMove, { passive: true });
    finale.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", updateScrollTarget, { passive: true });
    window.addEventListener("resize", updateScrollTarget, { passive: true });
    document.addEventListener("visibilitychange", updateScrollTarget);
    finePointer.addEventListener("change", handlePreferenceChange);
    reducedMotion.addEventListener("change", handlePreferenceChange);
    updateScrollTarget();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      finale.removeEventListener("pointermove", handlePointerMove);
      finale.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", updateScrollTarget);
      window.removeEventListener("resize", updateScrollTarget);
      document.removeEventListener("visibilitychange", updateScrollTarget);
      finePointer.removeEventListener("change", handlePreferenceChange);
      reducedMotion.removeEventListener("change", handlePreferenceChange);
      finale.classList.remove("landing-finale--visible");
      clearMotionStyles();
    };
  }, []);

  return (
    <div ref={visualRef} className="landing-finale-visual" aria-hidden="true">
      <picture className="landing-finale-picture">
        <img
          className="landing-finale-image"
          src="/media/seine-blue-hour-portasplit-v1.jpg"
          width="1672"
          height="941"
          loading="lazy"
          decoding="async"
          alt=""
        />
      </picture>
      <div className="landing-finale-color-wash" />
      <div className="landing-finale-window-glow" />
      <div className="landing-finale-river-glints"><i /><i /><i /><i /></div>
      <div className="landing-finale-scrim" />
      <div className="landing-finale-depth" />
      <div className="landing-finale-entry-veil" />
    </div>
  );
}
