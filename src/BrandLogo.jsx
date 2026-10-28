import mark from './assets/ridemate-mark.webp';
import wordmark from './assets/ridemate-wordmark.webp';
import './brand-logo.css';

export default function BrandLogo() {
  return <span className="brand-logo" role="img" aria-label="RideMate">
    <span className="brand-logo-mark" aria-hidden="true"><img src={mark} alt="" width="198" height="102" /></span>
    <span className="brand-logo-wordmark" aria-hidden="true"><img src={wordmark} alt="" width="330" height="60" /></span>
  </span>;
}
