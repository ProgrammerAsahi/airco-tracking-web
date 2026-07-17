import { useEffect, useRef } from "react";

type LandingStoryVisualProps = {
  tempLabel: string;
};

export function LandingStoryVisual({ tempLabel }: LandingStoryVisualProps) {
  const visualRef = useRef<HTMLDivElement | null>(null);
  const tempValueRef = useRef<HTMLSpanElement | null>(null);

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
        "--room-cool-layer-opacity",
        "--room-cool-reveal-inner",
        "--room-cool-reveal-outer",
        "--room-hot-opacity",
        "--room-warmth-opacity",
        "--room-refraction-high-opacity",
        "--room-refraction-low-opacity",
        "--room-dust-opacity",
        "--room-still-opacity",
        "--room-airflow-opacity",
        "--room-cooling-opacity",
        "--room-transition-mist-opacity",
        "--room-cool-wave-x",
        "--room-temp-hue",
      ].forEach((property) => visual.style.removeProperty(property));
    };

    // The temperature badge mirrors the visual cool-down: 34 °C while the
    // room is hot, easing to 24 °C as the cool layer takes over.
    const renderTemp = (coolProgress: number) => {
      const badge = tempValueRef.current;
      if (!badge) return;
      const temp = Math.round(34 - coolProgress * 10);
      const text = `${temp}°C`;
      if (badge.textContent !== text) badge.textContent = text;
      visual.style.setProperty("--room-temp-hue", `${16 + coolProgress * 183}`);
    };

    const renderFrame = () => {
      frame = 0;
      if (!visible || document.hidden || !motionEnabled()) return;

      currentX += (targetX - currentX) * 0.09;
      currentY += (targetY - currentY) * 0.09;
      currentProgress += (targetProgress - currentProgress) * 0.1;

      // Cooling spans the "snagged it" beat and completes as the relief
      // beat settles in, so the room is fully cool for the emotional payoff.
      const coolLinear = Math.min(1, Math.max(0, (currentProgress - 0.38) / 0.4));
      const coolProgress = coolLinear * coolLinear * (3 - 2 * coolLinear);
      const transitionMist = Math.sin(coolProgress * Math.PI) * 0.30;
      const revealOuter = coolProgress === 0 ? 0 : coolProgress * 150 + 10;
      const revealInner = Math.max(0, revealOuter - 32);
      renderTemp(coolProgress);

      visual.style.setProperty("--room-image-x", `${currentX * -12}px`);
      visual.style.setProperty("--room-image-y", `${currentY * -7 - currentProgress * 15}px`);
      visual.style.setProperty("--room-image-scale", `${1.075 - currentProgress * 0.038}`);
      visual.style.setProperty("--room-foreground-x", `${currentX * 18}px`);
      visual.style.setProperty("--room-foreground-y", `${currentY * 10 - currentProgress * 12}px`);
      visual.style.setProperty("--room-light-x", `${20 + currentX * 7}%`);
      visual.style.setProperty("--room-light-y", `${33 + currentY * 6}%`);
      visual.style.setProperty("--room-entry-opacity", `${Math.max(0, 1 - currentProgress * 7.5)}`);
      visual.style.setProperty("--room-cool-layer-opacity", `${Math.min(1, coolProgress * 3.2)}`);
      visual.style.setProperty("--room-cool-reveal-inner", `${revealInner}%`);
      visual.style.setProperty("--room-cool-reveal-outer", `${revealOuter}%`);
      visual.style.setProperty("--room-hot-opacity", "1");
      visual.style.setProperty("--room-warmth-opacity", `${0.94 - coolProgress * 0.82}`);
      visual.style.setProperty("--room-refraction-high-opacity", `${0.075 * (1 - coolProgress)}`);
      visual.style.setProperty("--room-refraction-low-opacity", `${0.055 * (1 - coolProgress)}`);
      visual.style.setProperty("--room-dust-opacity", `${0.76 * (1 - coolProgress)}`);
      visual.style.setProperty("--room-still-opacity", `${0.34 * (1 - coolProgress)}`);
      visual.style.setProperty("--room-airflow-opacity", `${Math.max(0, (coolProgress - 0.18) / 0.82)}`);
      visual.style.setProperty("--room-cooling-opacity", `${coolProgress * 0.46}`);
      visual.style.setProperty("--room-transition-mist-opacity", `${transitionMist}`);
      visual.style.setProperty("--room-cool-wave-x", `${(1 - coolProgress) * -18}px`);

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
      if (!motionEnabled()) {
        // Reduced motion skips the lerped frames, but the badge still
        // tracks the section so the readout never lies.
        const coolLinear = Math.min(1, Math.max(0, (targetProgress - 0.38) / 0.4));
        renderTemp(coolLinear * coolLinear * (3 - 2 * coolLinear));
        return;
      }
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
        if (tempValueRef.current) tempValueRef.current.textContent = "34°C";
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
      <picture className="landing-room-scene-picture landing-room-scene-picture--hot">
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
      <picture className="landing-room-scene-picture landing-room-scene-picture--cool">
        <source media="(max-width: 640px)" srcSet="/media/room-paris-cooled-portasplit-v1-mobile.jpg" />
        <img
          className="landing-room-scene-image"
          src="/media/room-paris-cooled-portasplit-v1.jpg"
          width="1672"
          height="941"
          loading="lazy"
          decoding="async"
          alt=""
        />
      </picture>
      <div className="landing-room-scene-cool-motion">
        <i className="landing-room-scene-cool-motion-curtain" />
        <i className="landing-room-scene-cool-motion-plant" />
      </div>
      <div className="landing-room-scene-warmth" />
      <div className="landing-room-scene-sunbeam" />
      <div className="landing-room-scene-refraction landing-room-scene-refraction--high" />
      <div className="landing-room-scene-refraction landing-room-scene-refraction--low" />
      <div className="landing-room-scene-dust">
        <i /><i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="landing-room-scene-still-air"><i /><i /><i /></div>
      <div className="landing-room-scene-transition-mist" />
      <div className="landing-room-scene-cooling" />
      <div className="landing-room-scene-airflow"><i /><i /><i /></div>
      <div className="landing-room-scene-scrim" />
      <div className="landing-room-scene-entry" />
      <div className="landing-room-scene-depth" />
      <div className="landing-room-temp">
        <span ref={tempValueRef} className="landing-room-temp-value">34°C</span>
        <span className="landing-room-temp-label">{tempLabel}</span>
      </div>
    </div>
  );
}
