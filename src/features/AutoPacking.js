const AutoPackingFeature = {
    id: 'feature_autoPacking',
    isRunning: false,
    isProcessing: false,
    isProcessingAll: false,
    lastProcessedCode: null,
    lastProcessedTime: 0,
    observer: null,

    playAudio(num) {
        // Hỗ trợ số nhóm từ 1 -> bất kỳ (chu kỳ xoay vòng từ 1.mp3 -> 7.mp3)
        const parsed = parseInt(String(num).replace(/\D/g, ''), 10);
        let soundNum = 1;
        if (!isNaN(parsed) && parsed > 0) {
            soundNum = ((parsed - 1) % 7) + 1;
        }

        const url = chrome.runtime.getURL(`assets/sounds/${soundNum}.mp3`);
        try {
            const audio = new Audio(url);
            audio.volume = 1.0;
            audio.currentTime = 0;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch((e) => {
                    console.warn(`GHN Helper Pro: Trình duyệt chặn phát âm thanh (${soundNum}.mp3):`, e);
                    // Thử lại sau 200ms
                    setTimeout(() => {
                        audio.play().catch(() => {});
                    }, 200);
                });
            }
        } catch (err) {
            console.error("GHN Helper Pro: Lỗi phát âm thanh AutoPacking:", err);
        }
    },

    // Kiểm tra và click nút bấm (chỉ click khi nút thực sự đã sẵn sàng / không bị disabled)
    clickBtn(text, mustBeEnabled = true) {
        const queryText = text.trim().toLowerCase();
        const buttons = Array.from(document.querySelectorAll('button, .ant-btn, [role="button"], input[type="button"]'));
        
        const btn = buttons.find(b => {
            const t = (b.textContent || b.innerText || b.value || '').trim().toLowerCase();
            if (!t.includes(queryText)) return false;

            if (mustBeEnabled) {
                // Kiểm tra trạng thái disable / loading của Ant Design & HTML
                const isDisabled = b.disabled || 
                                   b.getAttribute('disabled') !== null || 
                                   b.classList.contains('ant-btn-loading') || 
                                   b.classList.contains('disabled') || 
                                   b.getAttribute('aria-disabled') === 'true';
                if (isDisabled) return false;
            }
            return true;
        });

        if (btn) {
            btn.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            btn.click();
            return true;
        }
        return false;
    },

    // Tìm phần tử nhóm trên giao diện một cách linh hoạt
    findGroupElement(num) {
        const targetStr = String(num).trim();

        // 1. Tìm qua các class tiêu đề series
        const seriesElements = Array.from(document.querySelectorAll('p[class*="textSeries"], p[class*="_textSeries_"], [class*="textSeries"]'));
        for (const el of seriesElements) {
            const t = el.textContent.trim();
            if (t === targetStr || t === `Nhóm ${targetStr}` || t === `Kiện ${targetStr}` || t.startsWith(`${targetStr}/`) || t.startsWith(`${targetStr} `)) {
                return el.closest('[class*="item"], [class*="card"], [class*="box"], [class*="group"], [class*="wrapper"]') || el.closest('div') || el;
            }
        }

        // 2. Fallback tìm qua tất cả các thẻ chữ ngắn trong danh sách kiện
        const candidates = Array.from(document.querySelectorAll('p, span, div, strong, h4, h5, .ant-card, [class*="item"]')).filter(el => {
            if (el.children.length > 2) return false;
            const t = (el.innerText || el.textContent || '').trim();
            return t === targetStr || t === `Nhóm ${targetStr}` || t === `Kiện ${targetStr}` || t === `#${targetStr}`;
        });

        if (candidates.length > 0) {
            const el = candidates[0];
            return el.closest('[class*="item"], [class*="card"], [class*="box"], [class*="group"]') || el.closest('div') || el;
        }

        return null;
    },

    // Đóng và ẩn an toàn modal báo lỗi (chỉ thao tác NỘI BỘ trong modal, không click nhầm nút ngoài trang)
    closeErrorModal(modalElement) {
        if (!modalElement) return;

        // 1. Tìm và click nút đóng / OK / Xác nhận nằm BÊN TRONG modal
        const modalButtons = Array.from(modalElement.querySelectorAll('button, .ant-btn, [role="button"]'));
        const targetBtn = modalButtons.find(b => {
            const t = (b.textContent || b.innerText || b.value || '').trim().toLowerCase();
            return t === 'đóng' || t === 'ok' || t === 'xác nhận' || t.includes('đóng') || t.includes('ok');
        }) || modalElement.querySelector('.ant-modal-close');

        if (targetBtn) {
            targetBtn.click();
        }

        // 2. Ẩn toàn diện lớp mask, wrap và modal để không chắn click bên dưới
        try {
            const root = modalElement.closest('.ant-modal-root') || modalElement.closest('.ant-modal-wrap')?.parentElement;
            if (root) {
                const overlays = root.querySelectorAll('.ant-modal-mask, .ant-modal-wrap');
                overlays.forEach(el => {
                    el.style.pointerEvents = 'none';
                    el.style.display = 'none';
                });
            }
            const wrap = modalElement.closest('.ant-modal-wrap');
            if (wrap) {
                wrap.style.pointerEvents = 'none';
                wrap.style.display = 'none';
            }
            modalElement.style.display = 'none';
        } catch (e) {}
    },

    async processFromPopup(code) {
        const cleanCode = code.toLowerCase().replace('innhom', '').trim();
        const num = parseInt(cleanCode, 10) || cleanCode;
        console.log('GHN Helper Pro: 🚀 Bắt đầu xử lý đóng kiện số:', num);

        try {
            // 1. Tìm phần tử kiện trên màn hình
            const groupEl = this.findGroupElement(num);
            if (!groupEl) {
                console.log(`GHN Helper Pro: ❌ Không tìm thấy kiện số ${num} trên giao diện.`);
                return;
            }

            // 2. Click mở chi tiết kiện
            groupEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            groupEl.click();

            // 3. Đợi modal chi tiết mở ra và nút 'Hoàn tất đóng kiện' sẵn sàng
            let clickedComplete = false;
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 150));
                if (this.clickBtn('Hoàn tất đóng kiện', true) || this.clickBtn('Đóng kiện', true)) {
                    clickedComplete = true;
                    console.log(`GHN Helper Pro: ✅ Đã bấm 'Hoàn tất đóng kiện' cho kiện số ${num}`);
                    break;
                }
            }

            // 4. Phát âm thanh báo hiệu
            this.playAudio(num);

            // 5. Chờ hệ thống GHN xử lý xong và nút 'In tem' enabled (tối đa 3.5 giây)
            let clickedPrint = false;
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 150));
                if (this.clickBtn('In tem', true) || this.clickBtn('In Phiếu', true) || this.clickBtn('In', true)) {
                    clickedPrint = true;
                    console.log(`GHN Helper Pro: 🖨️ Đã bấm 'In tem' cho kiện số ${num}`);
                    break;
                }
            }

            if (!clickedPrint) {
                console.log(`GHN Helper Pro: ℹ️ Nút 'In tem' chưa sẵn sàng hoặc đã được in tự động.`);
            }

        } catch (err) {
            console.error('GHN Helper Pro: Lỗi trong quá trình AutoPacking:', err);
        } finally {
            setTimeout(() => {
                this.isProcessing = false;
            }, 600);
        }
    },

    async processGroup(num) {
        const groupEl = this.findGroupElement(num);
        if (!groupEl) {
            console.log(`GHN Helper Pro: ❌ Không tìm thấy kiện nhóm ${num}`);
            return false;
        }

        groupEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        groupEl.click();

        // Chờ nút 'Hoàn tất đóng kiện'
        let clickedComplete = false;
        for (let i = 0; i < 18; i++) {
            await new Promise(resolve => setTimeout(resolve, 150));
            if (this.clickBtn('Hoàn tất đóng kiện', true) || this.clickBtn('Đóng kiện', true)) {
                clickedComplete = true;
                break;
            }
            // Nếu sau 4 lần kiểm tra (~600ms) chưa mở được modal, thử click lại phần tử nhóm
            if (i === 3 && !clickedComplete) {
                groupEl.click();
            }
        }

        if (!clickedComplete) {
            console.warn(`GHN Helper Pro: ⚠️ Chưa thể bấm 'Hoàn tất đóng kiện' cho nhóm ${num}`);
        }

        // Phát âm thanh
        this.playAudio(num);

        // Chờ nút 'In tem'
        let clickedPrint = false;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 150));
            if (this.clickBtn('In tem', true) || this.clickBtn('In Phiếu', true) || this.clickBtn('In', true)) {
                clickedPrint = true;
                console.log(`GHN Helper Pro: 🖨️ Đã bấm 'In tem' cho nhóm ${num}`);
                break;
            }
        }

        if (!clickedPrint) {
            console.log(`GHN Helper Pro: ℹ️ Nút 'In tem' nhóm ${num} chưa sẵn sàng hoặc đã được in tự động.`);
        }

        // Chờ thêm 1 giây trước khi chuyển sang nhóm tiếp theo
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
    },

    async processAllGroups() {
        if (this.isProcessingAll) {
            console.log('GHN Helper Pro: Đang xử lý in toàn bộ, bỏ qua yêu cầu mới.');
            return;
        }
        this.isProcessingAll = true;
        this.isProcessing = true;

        try {
            // Lấy tất cả các nhóm hiện có trên trang và sắp xếp tăng dần
            const seriesElements = Array.from(document.querySelectorAll('p[class*="textSeries"], p[class*="_textSeries_"], [class*="textSeries"]'));
            const groups = Array.from(new Set(
                seriesElements
                    .map(el => el.textContent.trim().replace(/\D/g, ''))
                    .filter(text => text !== "" && !isNaN(Number(text)))
                    .map(Number)
            )).sort((a, b) => a - b);

            console.log('GHN Helper Pro: 🚀 Bắt đầu in toàn bộ các nhóm:', groups);

            for (const num of groups) {
                if (!this.isRunning) {
                    console.log('GHN Helper Pro: 🛑 Đã dừng tính năng, hủy in toàn bộ.');
                    break;
                }
                console.log(`GHN Helper Pro: 📦 Đang xử lý nhóm ${num}...`);
                await this.processGroup(num);
            }

            console.log('GHN Helper Pro: 🎉 Hoàn thành in toàn bộ các nhóm!');
        } finally {
            this.isProcessingAll = false;
            this.isProcessing = false;
        }
    },

    start() {
        this.isRunning = true;
        this.isProcessing = false;
        this.isProcessingAll = false;

        if (!this.observer) {
            this.observer = new MutationObserver(() => {
                if (!this.isRunning || this.isProcessingAll) return;

                const modalStrong = document.querySelector('[class*="modalContent"] strong, [class*="_modalContent_"] strong, .ant-modal-body strong, .ant-modal-confirm-body strong');
                if (modalStrong) {
                    const modalElement = modalStrong.closest('.ant-modal, .ant-modal-content, .ant-modal-confirm, [role="dialog"]') || modalStrong.parentElement;
                    if (modalElement && modalElement.getAttribute('data-ghn-packing-handled') === 'true') {
                        return;
                    }

                    const errorText = modalStrong.textContent.trim();
                    const errorTextLower = errorText.toLowerCase();

                    if (errorTextLower.includes('innhom')) {
                        if (modalElement) {
                            modalElement.setAttribute('data-ghn-packing-handled', 'true');
                        }

                        const now = Date.now();
                        if (this.lastProcessedCode === errorText && (now - this.lastProcessedTime) < 1500) {
                            return;
                        }

                        this.isProcessing = true;
                        this.lastProcessedCode = errorText;
                        this.lastProcessedTime = now;

                        console.log('GHN Helper Pro: 🎯 Phát hiện mã innhom trong Popup:', errorText);

                        // 1. Đóng modal lỗi ngay
                        this.closeErrorModal(modalElement);

                        // 2. Xóa ô input quét mã
                        const input = document.querySelector('#form-input-order-code_orderCode, #orderCode');
                        if (input) input.value = '';

                        // 3. Chạy logic đóng kiện sau khi modal lỗi đóng hoàn toàn
                        setTimeout(() => {
                            this.processFromPopup(errorText);
                        }, 300);
                    } else if (errorTextLower.includes('inall')) {
                        if (modalElement) {
                            modalElement.setAttribute('data-ghn-packing-handled', 'true');
                        }

                        const now = Date.now();
                        if (this.lastProcessedCode === errorText && (now - this.lastProcessedTime) < 1500) {
                            return;
                        }

                        this.isProcessing = true;
                        this.lastProcessedCode = errorText;
                        this.lastProcessedTime = now;

                        console.log('GHN Helper Pro: 🎯 Phát hiện mã inall trong Popup:', errorText);

                        // 1. Đóng modal lỗi ngay
                        this.closeErrorModal(modalElement);

                        // 2. Xóa ô input quét mã
                        const input = document.querySelector('#form-input-order-code_orderCode, #orderCode');
                        if (input) input.value = '';

                        // 3. Đợi modal đóng hoàn tất (350ms) rồi mới bắt đầu in toàn bộ để tránh xung đột với Nhóm 1
                        setTimeout(() => {
                            this.processAllGroups();
                        }, 350);
                    }
                }
            });
        }

        const targetNode = document.body;
        if (!targetNode) {
            console.warn('GHN Helper Pro: [AutoPacking] document.body chưa sẵn sàng, hoãn observe.');
            return;
        }
        this.observer.observe(targetNode, { childList: true, subtree: true });
        console.log('GHN Helper Pro: Auto Packing Feature Started');
    },

    stop() {
        this.isRunning = false;
        this.isProcessing = false;
        this.isProcessingAll = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        console.log('GHN Helper Pro: Auto Packing Feature Stopped');
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(AutoPackingFeature.id, AutoPackingFeature);
}
