import React, {Component, Suspense} from 'react';

// Keep navigation outside the boundary so an unavailable page chunk cannot
// trap the user. A document reload also retries failed browser module imports.
export default class ScreenContent extends Component {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if (this.state.failed) return <main className="page narrow" role="alert"><h1>Chưa tải được trang</h1><p>Kiểm tra kết nối rồi tải lại. Bạn vẫn có thể chuyển sang mục khác.</p><button className="soft" onClick={() => window.location.reload()}>Tải lại trang</button></main>;
    return <Suspense fallback={<main className="page" role="status">Đang tải nội dung…</main>}>{this.props.children}</Suspense>;
  }
}
