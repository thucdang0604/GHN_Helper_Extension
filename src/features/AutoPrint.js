const AutoPrintFeature = {
    id: 'feature_autoPrint',
    isRunning: false,

    start() {
        this.isRunning = true;
        this.checkAndPrint();
    },

    checkAndPrint() {
        // Phát hiện trang in của GHN (dựa vào URL chứa 'print' hoặc tiêu đề)
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        
        if (url.includes('print') || title.includes('in phiếu') || document.querySelector('.print-area')) {
            console.log("GHN Helper Pro: Phát hiện trang in. Sẽ tự động đóng tab sau khi xử lý xong...");

            // Lắng nghe sự kiện sau khi in (nếu bắt kịp)
            window.addEventListener('afterprint', () => {
                setTimeout(() => window.close(), 500);
            });

            // Hệ thống GHN đã TỰ ĐỘNG gọi window.print() khi tải trang in.
            // Việc extension gọi window.print() một lần nữa gây ra lỗi hiển thị 2 hộp thoại hoặc in 2 tờ.
            // Do đó chúng ta KHÔNG gọi window.print() ở đây nữa.

            // Logic tự đóng tab:
            // - Nếu không có --kiosk-printing: hộp thoại in mặc định của Chrome sẽ chặn (block) toàn bộ mã JS. 
            //   Hàm setTimeout dưới đây sẽ chỉ đếm thời gian SAU KHI hộp thoại in bị đóng lại.
            // - Nếu có --kiosk-printing: lệnh in chạy ngầm và không chặn JS. Tab sẽ đóng sau 2 giây (đủ để spool).
            // - Để an toàn không đóng nhầm tab làm việc chính, chỉ đóng nếu đây là tab mới mở để in.
            if (window.history.length <= 2 || window.opener) {
                setTimeout(() => {
                    window.close();
                }, 2000);
            }
        }
    },

    stop() {
        this.isRunning = false;
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(AutoPrintFeature.id, AutoPrintFeature);
}
