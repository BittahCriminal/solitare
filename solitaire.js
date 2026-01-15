/**
 * Solitaire (Klondike) Game
 * Draw-three variant with smart auto-complete algorithm
 */

// ============================================
// Card and Deck Data Structures
// ============================================

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.faceUp = false;
        this.id = `${rank}-${suit}`;
    }

    get value() {
        return RANKS.indexOf(this.rank) + 1;
    }

    get color() {
        return (this.suit === 'hearts' || this.suit === 'diamonds') ? 'red' : 'black';
    }

    get symbol() {
        return SUIT_SYMBOLS[this.suit];
    }

    flip() {
        this.faceUp = !this.faceUp;
        return this;
    }
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(new Card(suit, rank));
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ============================================
// Game State
// ============================================

class SolitaireGame {
    constructor() {
        this.stock = [];           // Draw pile (face-down)
        this.waste = [];           // Discard pile from stock (face-up)
        this.foundations = [[], [], [], []]; // 4 foundation piles (one per suit)
        this.tableau = [[], [], [], [], [], [], []]; // 7 tableau piles
        this.moves = 0;
        this.autoCompleting = false;
        this.autoCompleteInterval = null;

        this.dragState = {
            cards: [],
            sourceType: null,
            sourceIndex: null,
            startX: 0,
            startY: 0
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.newGame();
    }

    newGame() {
        // Stop any auto-complete in progress
        this.stopAutoComplete();

        // Reset state
        this.stock = [];
        this.waste = [];
        this.foundations = [[], [], [], []];
        this.tableau = [[], [], [], [], [], [], []];
        this.moves = 0;

        // Create and shuffle deck
        const deck = shuffleDeck(createDeck());

        // Deal to tableau
        let cardIndex = 0;
        for (let pile = 0; pile < 7; pile++) {
            for (let card = 0; card <= pile; card++) {
                const c = deck[cardIndex++];
                if (card === pile) {
                    c.faceUp = true; // Top card face up
                }
                this.tableau[pile].push(c);
            }
        }

        // Remaining cards go to stock
        while (cardIndex < deck.length) {
            this.stock.push(deck[cardIndex++]);
        }

        this.render();
        this.updateMoveCounter();
        this.hideWinOverlay();
    }

    // ============================================
    // Move Validation
    // ============================================

    canMoveToFoundation(card, foundationIndex) {
        const foundation = this.foundations[foundationIndex];

        if (foundation.length === 0) {
            // Only Aces can start a foundation
            return card.rank === 'A';
        }

        const topCard = foundation[foundation.length - 1];
        // Must be same suit and next rank
        return card.suit === topCard.suit && card.value === topCard.value + 1;
    }

    canMoveToTableau(card, pileIndex) {
        const pile = this.tableau[pileIndex];

        if (pile.length === 0) {
            // Only Kings can go on empty piles
            return card.rank === 'K';
        }

        const topCard = pile[pile.length - 1];
        // Must be opposite color and one rank lower
        return card.color !== topCard.color && card.value === topCard.value - 1;
    }

    // ============================================
    // Game Actions
    // ============================================

    drawFromStock() {
        if (this.stock.length === 0) {
            // Reset: move all waste cards back to stock (reversed)
            if (this.waste.length === 0) return;

            while (this.waste.length > 0) {
                const card = this.waste.pop();
                card.faceUp = false;
                this.stock.push(card);
            }
        } else {
            // Draw up to 3 cards
            const drawCount = Math.min(3, this.stock.length);
            for (let i = 0; i < drawCount; i++) {
                const card = this.stock.pop();
                card.faceUp = true;
                this.waste.push(card);
            }
            this.moves++;
        }

        this.render();
        this.updateMoveCounter();
    }

    moveWasteToFoundation(foundationIndex) {
        if (this.waste.length === 0) return false;

        const card = this.waste[this.waste.length - 1];
        if (this.canMoveToFoundation(card, foundationIndex)) {
            this.waste.pop();
            this.foundations[foundationIndex].push(card);
            this.moves++;
            this.render();
            this.updateMoveCounter();
            this.checkWin();
            return true;
        }
        return false;
    }

    moveWasteToTableau(pileIndex) {
        if (this.waste.length === 0) return false;

        const card = this.waste[this.waste.length - 1];
        if (this.canMoveToTableau(card, pileIndex)) {
            this.waste.pop();
            this.tableau[pileIndex].push(card);
            this.moves++;
            this.render();
            this.updateMoveCounter();
            return true;
        }
        return false;
    }

    moveTableauToFoundation(pileIndex, foundationIndex) {
        const pile = this.tableau[pileIndex];
        if (pile.length === 0) return false;

        const card = pile[pile.length - 1];
        if (!card.faceUp) return false;

        if (this.canMoveToFoundation(card, foundationIndex)) {
            pile.pop();
            this.foundations[foundationIndex].push(card);

            // Flip new top card if needed
            if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                pile[pile.length - 1].faceUp = true;
            }

            this.moves++;
            this.render();
            this.updateMoveCounter();
            this.checkWin();
            return true;
        }
        return false;
    }

    moveTableauToTableau(sourcePileIndex, cardIndex, targetPileIndex) {
        const sourcePile = this.tableau[sourcePileIndex];
        if (cardIndex >= sourcePile.length) return false;

        const card = sourcePile[cardIndex];
        if (!card.faceUp) return false;

        if (this.canMoveToTableau(card, targetPileIndex)) {
            // Move all cards from cardIndex to end
            const cardsToMove = sourcePile.splice(cardIndex);
            this.tableau[targetPileIndex].push(...cardsToMove);

            // Flip new top card if needed
            if (sourcePile.length > 0 && !sourcePile[sourcePile.length - 1].faceUp) {
                sourcePile[sourcePile.length - 1].faceUp = true;
            }

            this.moves++;
            this.render();
            this.updateMoveCounter();
            return true;
        }
        return false;
    }

    moveFoundationToTableau(foundationIndex, pileIndex) {
        const foundation = this.foundations[foundationIndex];
        if (foundation.length === 0) return false;

        const card = foundation[foundation.length - 1];
        if (this.canMoveToTableau(card, pileIndex)) {
            foundation.pop();
            this.tableau[pileIndex].push(card);
            this.moves++;
            this.render();
            this.updateMoveCounter();
            return true;
        }
        return false;
    }

    // ============================================
    // Auto-Complete Algorithm
    // ============================================

    /**
     * Smart auto-complete algorithm that considers:
     * 1. Safe moves to foundations (when cards underneath are already played)
     * 2. Tableau reorganization to uncover cards
     * 3. Stock cycling to find needed cards
     * 4. Strategic decisions about which cards to move
     */
    startAutoComplete() {
        if (this.autoCompleting) return;

        this.autoCompleting = true;
        document.getElementById('auto-status').classList.remove('hidden');
        document.getElementById('auto-complete-btn').disabled = true;

        this.autoCompleteInterval = setInterval(() => {
            if (!this.autoCompleteStep()) {
                this.stopAutoComplete();
            }
        }, 300); // 300ms between moves for visibility
    }

    stopAutoComplete() {
        this.autoCompleting = false;
        if (this.autoCompleteInterval) {
            clearInterval(this.autoCompleteInterval);
            this.autoCompleteInterval = null;
        }
        document.getElementById('auto-status').classList.add('hidden');
        document.getElementById('auto-complete-btn').disabled = false;
    }

    autoCompleteStep() {
        // Check for win first
        if (this.checkWin()) {
            return false;
        }

        // Priority 1: Move safe cards to foundations
        if (this.autoMoveSafeToFoundation()) {
            return true;
        }

        // Priority 2: Move tableau cards to foundations if beneficial
        if (this.autoMoveTableauToFoundation()) {
            return true;
        }

        // Priority 3: Move waste card to tableau or foundation
        if (this.autoMoveWaste()) {
            return true;
        }

        // Priority 4: Reorganize tableau to uncover face-down cards
        if (this.autoReorganizeTableau()) {
            return true;
        }

        // Priority 5: Move Kings to empty spaces strategically
        if (this.autoMoveKings()) {
            return true;
        }

        // Priority 6: Draw from stock
        if (this.stock.length > 0 || this.waste.length > 0) {
            this.drawFromStock();
            return true;
        }

        // No more moves possible
        return false;
    }

    /**
     * Determines if a card is safe to move to foundation
     * A card is safe if all cards that could be played on it are already
     * in foundations or if it's low value (2 or less)
     */
    isSafeToFoundation(card) {
        // Aces and 2s are always safe
        if (card.value <= 2) return true;

        // Check if opposite color cards of value-1 are both in foundations
        const neededValue = card.value - 1;
        const oppositeColors = card.color === 'red' ? ['spades', 'clubs'] : ['hearts', 'diamonds'];

        for (const suit of oppositeColors) {
            const foundationIndex = SUITS.indexOf(suit);
            const foundation = this.foundations[foundationIndex];
            const topValue = foundation.length > 0 ? foundation[foundation.length - 1].value : 0;

            if (topValue < neededValue) {
                return false;
            }
        }

        return true;
    }

    autoMoveSafeToFoundation() {
        // Check tableau piles for safe moves
        for (let i = 0; i < 7; i++) {
            const pile = this.tableau[i];
            if (pile.length === 0) continue;

            const card = pile[pile.length - 1];
            if (!card.faceUp) continue;

            if (this.isSafeToFoundation(card)) {
                for (let f = 0; f < 4; f++) {
                    if (this.canMoveToFoundation(card, f)) {
                        this.moveTableauToFoundation(i, f);
                        return true;
                    }
                }
            }
        }

        // Check waste
        if (this.waste.length > 0) {
            const card = this.waste[this.waste.length - 1];
            if (this.isSafeToFoundation(card)) {
                for (let f = 0; f < 4; f++) {
                    if (this.canMoveToFoundation(card, f)) {
                        this.moveWasteToFoundation(f);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    autoMoveTableauToFoundation() {
        // Look for cards that can go to foundation and won't block progress
        for (let i = 0; i < 7; i++) {
            const pile = this.tableau[i];
            if (pile.length === 0) continue;

            const card = pile[pile.length - 1];
            if (!card.faceUp) continue;

            // Check if moving this card would reveal a face-down card
            const wouldReveal = pile.length > 1 && !pile[pile.length - 2].faceUp;

            for (let f = 0; f < 4; f++) {
                if (this.canMoveToFoundation(card, f)) {
                    // Prefer moves that reveal cards or are safe
                    if (wouldReveal || this.isSafeToFoundation(card)) {
                        this.moveTableauToFoundation(i, f);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    autoMoveWaste() {
        if (this.waste.length === 0) return false;

        const card = this.waste[this.waste.length - 1];

        // Try foundation first
        for (let f = 0; f < 4; f++) {
            if (this.canMoveToFoundation(card, f)) {
                this.moveWasteToFoundation(f);
                return true;
            }
        }

        // Try tableau - prefer piles that would uncover cards
        let bestPile = -1;
        let bestScore = -1;

        for (let i = 0; i < 7; i++) {
            if (this.canMoveToTableau(card, i)) {
                let score = 0;

                // Prefer placing on piles with face-down cards
                const faceDownCount = this.tableau[i].filter(c => !c.faceUp).length;
                score += faceDownCount * 2;

                // Prefer non-empty piles (don't waste Kings on empty unless necessary)
                if (this.tableau[i].length > 0) {
                    score += 1;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestPile = i;
                }
            }
        }

        if (bestPile >= 0) {
            this.moveWasteToTableau(bestPile);
            return true;
        }

        return false;
    }

    autoReorganizeTableau() {
        // Look for moves that would reveal face-down cards
        for (let source = 0; source < 7; source++) {
            const sourcePile = this.tableau[source];
            if (sourcePile.length === 0) continue;

            // Find the first face-up card
            let firstFaceUpIndex = sourcePile.findIndex(c => c.faceUp);
            if (firstFaceUpIndex === -1) continue;

            // Only interested if there are face-down cards beneath
            if (firstFaceUpIndex === 0) continue;

            const card = sourcePile[firstFaceUpIndex];

            // Try to move this stack elsewhere
            for (let target = 0; target < 7; target++) {
                if (target === source) continue;

                if (this.canMoveToTableau(card, target)) {
                    this.moveTableauToTableau(source, firstFaceUpIndex, target);
                    return true;
                }
            }
        }

        return false;
    }

    autoMoveKings() {
        // Find empty tableau piles
        const emptyPiles = [];
        for (let i = 0; i < 7; i++) {
            if (this.tableau[i].length === 0) {
                emptyPiles.push(i);
            }
        }

        if (emptyPiles.length === 0) return false;

        // Look for Kings that have face-down cards beneath them
        for (let source = 0; source < 7; source++) {
            const sourcePile = this.tableau[source];
            if (sourcePile.length === 0) continue;

            const firstFaceUpIndex = sourcePile.findIndex(c => c.faceUp);
            if (firstFaceUpIndex <= 0) continue; // No face-down cards or King at bottom

            const card = sourcePile[firstFaceUpIndex];
            if (card.rank === 'K') {
                this.moveTableauToTableau(source, firstFaceUpIndex, emptyPiles[0]);
                return true;
            }
        }

        return false;
    }

    // ============================================
    // Win Detection
    // ============================================

    checkWin() {
        const totalInFoundations = this.foundations.reduce((sum, f) => sum + f.length, 0);
        if (totalInFoundations === 52) {
            this.showWinOverlay();
            return true;
        }
        return false;
    }

    showWinOverlay() {
        this.stopAutoComplete();
        document.getElementById('win-stats').textContent = `Completed in ${this.moves} moves`;
        document.getElementById('win-overlay').classList.remove('hidden');
    }

    hideWinOverlay() {
        document.getElementById('win-overlay').classList.add('hidden');
    }

    // ============================================
    // Rendering
    // ============================================

    render() {
        this.renderStock();
        this.renderWaste();
        this.renderFoundations();
        this.renderTableau();
    }

    createCardElement(card, zIndex = 0) {
        const el = document.createElement('div');
        el.className = `card ${card.faceUp ? 'face-up' : 'face-down'} ${card.color}`;
        el.dataset.cardId = card.id;
        el.style.zIndex = zIndex;

        if (card.faceUp) {
            el.innerHTML = `
                <div class="card-corner top-left">
                    <span class="card-rank">${card.rank}</span>
                    <span class="card-suit">${card.symbol}</span>
                </div>
                <div class="card-center">${card.symbol}</div>
                <div class="card-corner bottom-right">
                    <span class="card-rank">${card.rank}</span>
                    <span class="card-suit">${card.symbol}</span>
                </div>
            `;
        }

        return el;
    }

    renderStock() {
        const stockEl = document.getElementById('stock');
        stockEl.innerHTML = '';

        if (this.stock.length === 0) {
            stockEl.classList.add('empty');
            stockEl.innerHTML = '<div class="slot-label"></div>';
        } else {
            stockEl.classList.remove('empty');
            // Show back of top card
            const cardEl = this.createCardElement(this.stock[this.stock.length - 1]);
            cardEl.style.position = 'absolute';
            cardEl.style.left = '0';
            cardEl.style.top = '0';
            stockEl.appendChild(cardEl);
        }
    }

    renderWaste() {
        const wasteEl = document.getElementById('waste');
        wasteEl.innerHTML = '<div class="slot-label">Waste</div>';

        // Show up to 3 cards spread out
        const visibleCount = Math.min(3, this.waste.length);
        const startIndex = this.waste.length - visibleCount;

        for (let i = 0; i < visibleCount; i++) {
            const card = this.waste[startIndex + i];
            const cardEl = this.createCardElement(card, i);
            cardEl.style.position = 'absolute';
            cardEl.style.left = `${i * 25}px`;
            cardEl.style.top = '0';

            // Only top card is draggable
            if (i === visibleCount - 1) {
                this.makeCardDraggable(cardEl, 'waste', 0);
            }

            wasteEl.appendChild(cardEl);
        }
    }

    renderFoundations() {
        for (let i = 0; i < 4; i++) {
            const foundationEl = document.querySelector(`.foundation[data-foundation="${i}"]`);
            const foundation = this.foundations[i];

            // Keep the slot label
            foundationEl.innerHTML = `<div class="slot-label">${SUIT_SYMBOLS[SUITS[i]]}</div>`;

            if (foundation.length > 0) {
                // Only show top card
                const card = foundation[foundation.length - 1];
                const cardEl = this.createCardElement(card, 1);
                cardEl.style.position = 'absolute';
                cardEl.style.left = '0';
                cardEl.style.top = '0';
                this.makeCardDraggable(cardEl, 'foundation', i);
                foundationEl.appendChild(cardEl);
            }

            this.makeDropTarget(foundationEl, 'foundation', i);
        }
    }

    renderTableau() {
        for (let i = 0; i < 7; i++) {
            const pileEl = document.querySelector(`.tableau-pile[data-pile="${i}"]`);
            const pile = this.tableau[i];

            pileEl.innerHTML = '';

            pile.forEach((card, cardIndex) => {
                const cardEl = this.createCardElement(card, cardIndex);
                cardEl.style.position = 'absolute';
                cardEl.style.left = '0';
                cardEl.style.top = `${cardIndex * 25}px`;

                if (card.faceUp) {
                    this.makeCardDraggable(cardEl, 'tableau', i, cardIndex);
                }

                pileEl.appendChild(cardEl);
            });

            // Adjust pile height
            const height = Math.max(140, pile.length * 25 + 115);
            pileEl.style.height = `${height}px`;

            this.makeDropTarget(pileEl, 'tableau', i);
        }
    }

    // ============================================
    // Drag and Drop
    // ============================================

    makeCardDraggable(cardEl, sourceType, sourceIndex, cardIndex = 0) {
        cardEl.addEventListener('mousedown', (e) => {
            if (this.autoCompleting) return;
            e.preventDefault();

            let cards = [];
            if (sourceType === 'waste') {
                cards = [this.waste[this.waste.length - 1]];
            } else if (sourceType === 'foundation') {
                cards = [this.foundations[sourceIndex][this.foundations[sourceIndex].length - 1]];
            } else if (sourceType === 'tableau') {
                cards = this.tableau[sourceIndex].slice(cardIndex);
            }

            this.dragState = {
                cards,
                sourceType,
                sourceIndex,
                cardIndex,
                startX: e.clientX,
                startY: e.clientY,
                elements: []
            };

            // Mark dragged cards
            if (sourceType === 'tableau') {
                const pileEl = document.querySelector(`.tableau-pile[data-pile="${sourceIndex}"]`);
                const cardEls = pileEl.querySelectorAll('.card');
                for (let i = cardIndex; i < cardEls.length; i++) {
                    cardEls[i].classList.add('dragging');
                    this.dragState.elements.push(cardEls[i]);
                }
            } else {
                cardEl.classList.add('dragging');
                this.dragState.elements.push(cardEl);
            }

            // Show valid drop targets
            this.highlightValidDrops();
        });

        // Double-click to auto-move to foundation
        cardEl.addEventListener('dblclick', (e) => {
            if (this.autoCompleting) return;
            e.preventDefault();

            let card;
            if (sourceType === 'waste') {
                card = this.waste[this.waste.length - 1];
            } else if (sourceType === 'tableau') {
                const pile = this.tableau[sourceIndex];
                card = pile[pile.length - 1];
                if (cardIndex !== pile.length - 1) return; // Only top card
            } else {
                return;
            }

            // Try to move to foundation
            for (let f = 0; f < 4; f++) {
                if (this.canMoveToFoundation(card, f)) {
                    if (sourceType === 'waste') {
                        this.moveWasteToFoundation(f);
                    } else {
                        this.moveTableauToFoundation(sourceIndex, f);
                    }
                    return;
                }
            }
        });
    }

    makeDropTarget(el, targetType, targetIndex) {
        el.addEventListener('mouseup', (e) => {
            if (!this.dragState.cards.length) return;

            const { sourceType, sourceIndex, cardIndex } = this.dragState;
            let moved = false;

            if (targetType === 'foundation' && this.dragState.cards.length === 1) {
                if (sourceType === 'waste') {
                    moved = this.moveWasteToFoundation(targetIndex);
                } else if (sourceType === 'tableau') {
                    moved = this.moveTableauToFoundation(sourceIndex, targetIndex);
                } else if (sourceType === 'foundation' && sourceIndex !== targetIndex) {
                    // Foundation to foundation not typically allowed
                }
            } else if (targetType === 'tableau') {
                if (sourceType === 'waste') {
                    moved = this.moveWasteToTableau(targetIndex);
                } else if (sourceType === 'tableau' && sourceIndex !== targetIndex) {
                    moved = this.moveTableauToTableau(sourceIndex, cardIndex, targetIndex);
                } else if (sourceType === 'foundation') {
                    moved = this.moveFoundationToTableau(sourceIndex, targetIndex);
                }
            }

            this.clearDragState();
        });
    }

    highlightValidDrops() {
        if (this.dragState.cards.length === 0) return;

        const card = this.dragState.cards[0];

        // Check foundations (only for single cards)
        if (this.dragState.cards.length === 1) {
            for (let f = 0; f < 4; f++) {
                if (this.canMoveToFoundation(card, f)) {
                    document.querySelector(`.foundation[data-foundation="${f}"]`).classList.add('valid-drop');
                }
            }
        }

        // Check tableau
        for (let t = 0; t < 7; t++) {
            if (this.dragState.sourceType === 'tableau' && this.dragState.sourceIndex === t) continue;
            if (this.canMoveToTableau(card, t)) {
                document.querySelector(`.tableau-pile[data-pile="${t}"]`).classList.add('valid-drop');
            }
        }
    }

    clearDragState() {
        // Remove dragging class
        this.dragState.elements.forEach(el => {
            el.classList.remove('dragging');
        });

        // Remove valid drop highlights
        document.querySelectorAll('.valid-drop').forEach(el => {
            el.classList.remove('valid-drop');
        });

        this.dragState = {
            cards: [],
            sourceType: null,
            sourceIndex: null,
            cardIndex: 0,
            startX: 0,
            startY: 0,
            elements: []
        };
    }

    // ============================================
    // Event Listeners
    // ============================================

    setupEventListeners() {
        // Stock click
        document.getElementById('stock').addEventListener('click', (e) => {
            if (this.autoCompleting) return;
            // Only trigger if clicking the slot itself or the back of a card
            if (e.target.closest('.face-up')) return;
            this.drawFromStock();
        });

        // New game button
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.newGame();
        });

        // Auto-complete button
        document.getElementById('auto-complete-btn').addEventListener('click', () => {
            this.startAutoComplete();
        });

        // Stop auto-complete button
        document.getElementById('stop-auto-btn').addEventListener('click', () => {
            this.stopAutoComplete();
        });

        // Play again button
        document.getElementById('play-again-btn').addEventListener('click', () => {
            this.newGame();
        });

        // Global mouse up to clear drag state
        document.addEventListener('mouseup', () => {
            if (this.dragState.cards.length > 0) {
                this.clearDragState();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'n' && e.ctrlKey) {
                e.preventDefault();
                this.newGame();
            } else if (e.key === 'a' && e.ctrlKey) {
                e.preventDefault();
                if (!this.autoCompleting) {
                    this.startAutoComplete();
                } else {
                    this.stopAutoComplete();
                }
            } else if (e.key === ' ') {
                e.preventDefault();
                this.drawFromStock();
            }
        });
    }

    updateMoveCounter() {
        document.getElementById('move-counter').textContent = `Moves: ${this.moves}`;
    }
}

// ============================================
// Initialize Game
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    window.game = new SolitaireGame();
});
