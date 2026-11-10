// Provisioned hires have a stable request UUID in their username. Other legacy
// first-login policies retain their existing behavior.
export function requiresOnboardingPasswordChange(username: string, isFirstLogin?: boolean): boolean {
  const nativeHire = /^onb\.(?:[a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(username)
  // A missing profile during restoration must not unlock a known native hire.
  return nativeHire && isFirstLogin !== false
}
