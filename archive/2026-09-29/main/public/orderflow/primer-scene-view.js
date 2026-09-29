import { drawPrimerMobile } from "./primer-mobile-view.js";
import { drawPrimerDesktop } from "./primer-desktop-view.js";
export { pairingAt, transfersAt } from "./primer-animation.js";

export function drawPrimer(p) {
  return p.mobile ? drawPrimerMobile(p) : drawPrimerDesktop(p);
}
