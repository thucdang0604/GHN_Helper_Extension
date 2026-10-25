const HideReceiptFeature = {
    id: 'feature_hideReceipt',
    isRunning: false,
    observer: null,

    hideCreateButtons() {
        if (!this.isRunning) return;
        try {
            // Tìm tất cả các nút trong cột "Thao tác" hoặc bất kỳ nút nào trong bảng
            const buttons = document.querySelectorAll('.ant-table-tbody .ant-table-cell button, button.ant-btn.ant-btn-primary');

            buttons.forEach((button) => {
                const span = button.querySelector('span');
                if (!span) return;

                const buttonText = span.textContent.trim();

                // Kiểm tra nội dung nút, không phân biệt hoa thường
                if (buttonText.toLowerCase() === 'tạo phiếu thu') {
                    if (button.style.display !== 'none') {
                        button.style.display = 'none'; // Ẩn nút
                        button.classList.add('ghn-hidden-receipt'); // Đánh dấu để khôi phục sau này
                    }
                }
            });
        } catch (error) {
            console.error('GHN Helper Pro: Lỗi khi chạy hideCreateButtons:', error);
        }
    },

    restoreCreateButtons() {
        const hiddenButtons = document.querySelectorAll('.ghn-hidden-receipt');
        hiddenButtons.forEach(button => {
            button.style.display = '';
            button.classList.remove('ghn-hidden-receipt');
        });
    },

    start() {
        this.isRunning = true;
        
        // Chạy ngay lần đầu
        this.hideCreateButtons();

        // Chạy lại sau 1 giây để xử lý tải chậm
        setTimeout(() => this.hideCreateButtons(), 1000);

        // Quan sát thay đổi động trong DOM
        if (!this.observer) {
            this.observer = new MutationObserver(() => {
                this.hideCreateButtons();
            });
        }

        // Bắt đầu quan sát
        const targetNode = document.body;
        if (!targetNode) {
            console.warn("GHN Helper Pro: [HideReceipt] document.body chưa sẵn sàng, hoãn observe.");
            return;
        }
        this.observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    },

    stop() {
        this.isRunning = false;
        
        if (this.observer) {
            this.observer.disconnect();
        }
        
        // Khôi phục lại các nút đã ẩn
        this.restoreCreateButtons();
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(HideReceiptFeature.id, HideReceiptFeature);
}
