export type PersonalAnchorInterpretation = {
  /**
   * Short line that turns the user's raw goal into a clearer direction.
   * Example: "You want to return to better health without making the day heavier."
   */
  directionLine: string;

  /**
   * Short line that captures why this matters to the user.
   * Should stay close to the user's own motivation.
   */
  whyLine: string;

  /**
   * Short line that names the likely friction without making it dramatic.
   * Example: "Stress may make the step smaller, not impossible."
   */
  frictionLine: string;

  /**
   * Short line that helps the user return without guilt or pressure.
   * Example: "Today does not need to be perfect to count."
   */
  returnLine: string;
};

export type IntakeV2 = {
  name: string;
  goal: string;
  struggle: string;

  /**
   * User-specific interpretation generated from intake + screening context.
   * This is the preferred source for personal guidance in the MVP.
   */
  personalAnchorInterpretation?: PersonalAnchorInterpretation;

  /**
   * One short sentence that captures why the user's goal matters.
   * Required in the active intake contract.
   */
  goalWhy: string;

  /**
   * Legacy reflection question tailored to the user.
   * Kept temporarily for backwards compatibility with older localStorage data.
   */
  reflectionQuestion?: string;

  /**
   * Legacy directional closure.
   * Kept temporarily for backwards compatibility with older localStorage data.
   */
  closureLines?: readonly [string, string, string];
};
