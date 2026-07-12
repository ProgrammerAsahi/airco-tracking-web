import { useEffect, useRef } from "react";

export function LandingStoryVisual() {
  const visualRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const visual = visualRef.current;
    const story = visual?.closest<HTMLElement>(".landing-story");
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
      [
        "--room-image-x",
        "--room-image-y",
        "--room-image-scale",
        "--room-foreground-x",
        "--room-foreground-y",
        "--room-light-x",
        "--room-light-y",
        "--room-entry-opacity",
      ].forEach((property) => visual.style.removeProperty(property));
    };

    const renderFrame = () => {
      frame = 0;
      if (!visible || document.hidden || !motionEnabled()) return;

      currentX += (targetX - currentX) * 0.09;
      currentY += (targetY - currentY) * 0.09;
      currentProgress += (targetProgress - currentProgress) * 0.1;

      visual.style.setProperty("--room-image-x", `${currentX * -12}px`);
      visual.style.setProperty("--room-image-y", `${currentY * -7 - currentProgress * 15}px`);
      visual.style.setProperty("--room-image-scale", `${1.075 - currentProgress * 0.038}`);
      visual.style.setProperty("--room-foreground-x", `${currentX * 18}px`);
      visual.style.setProperty("--room-foreground-y", `${currentY * 10 - currentProgress * 12}px`);
      visual.style.setProperty("--room-light-x", `${20 + currentX * 7}%`);
      visual.style.setProperty("--room-light-y", `${33 + currentY * 6}%`);
      visual.style.setProperty("--room-entry-opacity", `${Math.max(0, 1 - currentProgress * 7.5)}`);

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
    <div ref={visualRef} className="landing-room-scene" aria-hidden="true">
      <picture className="landing-room-scene-picture">
        <source media="(max-width: 640px)" srcSet="/media/room-paris-heatwave-v2-mobile.jpg" />
        <img
          className="landing-room-scene-image"
          src="/media/room-paris-heatwave-v1.jpg"
          width="1672"
          height="941"
          loading="lazy"
          decoding="async"
          alt=""
        />
      </picture>
      <div className="landing-room-scene-warmth" />
      <div className="landing-room-scene-sunbeam" />
      <div className="landing-room-scene-refraction landing-room-scene-refraction--high" />
      <div className="landing-room-scene-refraction landing-room-scene-refraction--low" />
      <div className="landing-room-scene-dust">
        <i /><i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="landing-room-scene-still-air"><i /><i /><i /></div>
      <div className="landing-room-scene-cooling" />
      <div className="landing-room-scene-scrim" />
      <div className="landing-room-scene-entry" />
      <div className="landing-room-scene-depth" />
    </div>
  );
}
