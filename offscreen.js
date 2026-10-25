let audioUrl = null;

function playAlertSound() {
    if (!audioUrl) {
        audioUrl = chrome.runtime.getURL('assets/sounds/ticket.mp3');
    }

    const audio = new Audio(audioUrl);
    audio.play().catch((e) => {
        console.warn('GHN Helper Pro: Không phát được âm thanh trong offscreen.', e);
    });
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.command === 'TICKET_COUNT_INCREASED') {
        playAlertSound();
    }
});

