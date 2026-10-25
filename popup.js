document.addEventListener('DOMContentLoaded', () => {
    const toggleGlobal = document.getElementById('toggleGlobal');
    const statusText = document.getElementById('statusText');
    const featureList = document.getElementById('featureList');

    const featureIds = [
        'feature_orderInfo',
        'feature_hideReceipt',
        'feature_bulkDelete',
        'feature_autoPacking',
        'feature_orderChecker',
        'feature_packageAlert',
        'feature_ticketAlert',
        'feature_autoPrint',
        'feature_bulkAssign',
        'feature_autoUnpackComplete',
        'feature_autoCloseModal',
        'feature_autoScanStatus',
        'feature_tripPriceCollector',
        'feature_bulkReceiverInfo'
    ];

    // Xử lý nút mở nhanh công cụ Tra cứu SĐT
    const btnOpenBulk = document.getElementById('btnOpenBulkReceiverInfo');
    if (btnOpenBulk) {
        btnOpenBulk.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        command: 'OPEN_BULK_RECEIVER_INFO'
                    }).then(() => {
                        window.close();
                    }).catch(() => {
                        alert("Vui lòng mở một tab GHN (nhanh.ghn.vn) và tải lại trang (F5) trước khi mở công cụ!");
                    });
                }
            });
        });
    }

    // Lấy trạng thái đã lưu
    chrome.storage.local.get(['globalEnabled', 'featuresConfig'], (result) => {
        const isEnabled = result.globalEnabled !== false; // Default true
        toggleGlobal.checked = isEnabled;
        updateUI(isEnabled);

        const config = result.featuresConfig || {};
        featureIds.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                // Mặc định bật tất cả các tính năng nếu chưa có config
                checkbox.checked = config[id] !== false;
                checkbox.disabled = !isEnabled;

                checkbox.addEventListener('change', (e) => {
                    if (id === 'feature_autoPrint' && e.target.checked) {
                        alert("LƯU Ý QUAN TRỌNG:\n\nTrình duyệt Chrome không cho phép tiện ích tắt hộp thoại xem trước bản in (Print Preview) vì lý do bảo mật.\n\nĐể tính năng In Nhanh hoạt động tự động hoàn toàn, bạn BẮT BUỘC phải thêm cờ '--kiosk-printing' vào Shortcut của Chrome ngoài Desktop.\n\nTiện ích này sẽ tự động kích hoạt lệnh in và đóng tab khi phát hiện trang in.");
                    }
                    saveAndNotify();
                });
            }
        });
    });

    toggleGlobal.addEventListener('change', () => {
        const isEnabled = toggleGlobal.checked;
        featureIds.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.disabled = !isEnabled;
        });
        updateUI(isEnabled);
        saveAndNotify();
    });

    function saveAndNotify() {
        const config = {};
        featureIds.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) config[id] = checkbox.checked;
        });

        const globalEnabled = toggleGlobal.checked;

        chrome.storage.local.set({
            globalEnabled: globalEnabled,
            featuresConfig: config
        }, () => {
            // Gửi message cập nhật cấu hình cho trang web đang mở
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].url && tabs[0].url.includes("ghn.vn")) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        command: "UPDATE_CONFIG",
                        globalEnabled: globalEnabled,
                        config: config
                    }).catch(err => {
                        console.warn("GHN Helper Pro: Vui lòng tải lại trang (F5) để kết nối.");
                    });
                }
            });
        });
    }

    function updateUI(isEnabled) {
        statusText.innerText = isEnabled ? "Hệ thống đang BẬT" : "Hệ thống đã TẮT";
        statusText.style.color = isEnabled ? "#2ecc71" : "#e74c3c";
        featureList.style.opacity = isEnabled ? "1" : "0.5";
    }

    // --- Tính năng kiểm tra cập nhật từ GitHub ---
    const extVersionElem = document.getElementById('extVersion');
    const btnCheckUpdate = document.getElementById('btnCheckUpdate');
    const updateResult = document.getElementById('updateResult');
    const updateMsg = document.getElementById('updateMsg');
    const updateNotes = document.getElementById('updateNotes');
    const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
    const updateBadge = document.getElementById('updateBadge');

    const currentVersion = chrome.runtime.getManifest().version;
    if (extVersionElem) {
        extVersionElem.innerText = `v${currentVersion}`;
    }

    const GITHUB_REPO = 'thucdang0604/GHN_Helper_Extension';

    function compareVersions(v1, v2) {
        // v1: current, v2: remote (loại bỏ 'v' nếu có)
        const s1 = v1.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
        const s2 = v2.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
        const maxLen = Math.max(s1.length, s2.length);
        for (let i = 0; i < maxLen; i++) {
            const num1 = s1[i] || 0;
            const num2 = s2[i] || 0;
            if (num2 > num1) return 1;  // remote mới hơn
            if (num2 < num1) return -1; // local mới hơn
        }
        return 0; // bằng nhau
    }

    if (btnCheckUpdate) {
        btnCheckUpdate.addEventListener('click', async () => {
            btnCheckUpdate.disabled = true;
            btnCheckUpdate.innerText = '⏳ Đang kiểm tra...';
            updateResult.style.display = 'none';

            try {
                // 1. Thử lấy Release mới nhất từ GitHub API
                const releaseRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                });

                if (releaseRes.ok) {
                    const release = await releaseRes.json();
                    const remoteVer = release.tag_name || release.name;
                    
                    if (compareVersions(currentVersion, remoteVer) > 0) {
                        // Có bản mới hơn
                        updateResult.style.display = 'block';
                        updateMsg.innerText = `🚀 Có bản mới: ${remoteVer} (Hiện tại: v${currentVersion})`;
                        updateMsg.style.color = '#e74c3c';
                        updateNotes.innerText = release.body || 'Cập nhật sửa lỗi và tối ưu hiệu năng.';
                        
                        // Tìm file zip đính kèm trong assets, nếu không có lấy zipball
                        const zipAsset = release.assets && release.assets.find(a => a.name.endsWith('.zip'));
                        btnDownloadUpdate.href = zipAsset ? zipAsset.browser_download_url : `https://github.com/${GITHUB_REPO}/archive/refs/tags/${release.tag_name}.zip`;
                        btnDownloadUpdate.style.display = 'block';
                        if (updateBadge) updateBadge.style.display = 'inline-block';
                        btnCheckUpdate.innerText = '🔄 Kiểm tra lại';
                        btnCheckUpdate.disabled = false;
                        return;
                    }
                }

                // 2. Dự phòng: Kiểm tra manifest.json trên nhánh main
                const rawRes = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/manifest.json?t=${Date.now()}`);
                if (rawRes.ok) {
                    const rawManifest = await rawRes.json();
                    const remoteVer = rawManifest.version;

                    if (remoteVer && compareVersions(currentVersion, remoteVer) > 0) {
                        updateResult.style.display = 'block';
                        updateMsg.innerText = `🚀 Có bản mới: v${remoteVer} (Hiện tại: v${currentVersion})`;
                        updateMsg.style.color = '#e74c3c';
                        updateNotes.innerText = 'Đã có bản cập nhật mới trên GitHub. Bấm tải về để cập nhật.';
                        btnDownloadUpdate.href = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;
                        btnDownloadUpdate.style.display = 'block';
                        if (updateBadge) updateBadge.style.display = 'inline-block';
                        btnCheckUpdate.innerText = '🔄 Kiểm tra lại';
                        btnCheckUpdate.disabled = false;
                        return;
                    }
                }

                // Nếu là phiên bản mới nhất
                updateResult.style.display = 'block';
                updateMsg.innerText = `✅ Bạn đang dùng bản mới nhất (v${currentVersion})!`;
                updateMsg.style.color = '#27ae60';
                updateNotes.innerText = 'Không có bản cập nhật nào mới hơn.';
                btnDownloadUpdate.style.display = 'none';
                if (updateBadge) updateBadge.style.display = 'none';

            } catch (err) {
                console.error("Lỗi kiểm tra cập nhật:", err);
                updateResult.style.display = 'block';
                updateMsg.innerText = '⚠️ Không thể kiểm tra lúc này.';
                updateMsg.style.color = '#f39c12';
                updateNotes.innerText = 'Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau.';
                btnDownloadUpdate.href = `https://github.com/${GITHUB_REPO}`;
                btnDownloadUpdate.innerText = '🌐 Mở trang GitHub';
                btnDownloadUpdate.style.display = 'block';
            } finally {
                btnCheckUpdate.disabled = false;
                btnCheckUpdate.innerText = '🔄 Kiểm tra cập nhật';
            }
        });
    }
});