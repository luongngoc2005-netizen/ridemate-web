import logo from './assets/ridemate-logo.png';
import './brand-logo.css';

export default function BrandLogo() {
  return <span className="brand-logo" role="img" aria-label="RideMate">
    <span className="brand-logo-mark" aria-hidden="true"><img src={logo} alt="" width="1774" height="887" /></span>
    <span className="brand-logo-wordmark" aria-hidden="true"><img src={logo} alt="" width="1774" height="887" /></span>
  </span>;
}
