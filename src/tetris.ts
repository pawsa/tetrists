/* Implements a Tetris game in a browser. */

/** The playing field. Consists of an empty space that can have Squares
 * placed on it.
 * The simplest use is:
 * let fe = document.getElementsByClassName("playing-field")[0];
 * let f = new Field(fe, 8, 20);
 * let s = new Square(f, 0, 0);
 * s.move(1, 0);
 * s.remove();
 */
class Field {
    elem: HTMLElement;
    width: number;
    height: number;

    constructor(el: HTMLElement, w: number, h: number) {
        this.elem = el;
        this.width = w; this.height = h;
    }
}

class Square {
    field: Field;
    elem: HTMLElement;
    x: number;
    y: number;

    constructor(f: Field, x: number, y: number) {
        this.field = f;
        this.elem = document.createElement("div");
        this.elem.classList.add("block");

        this._moveUnchecked(x, y);
        this.elem.style.width = (this.field.elem.offsetWidth / this.field.width) + 'px';
        this.elem.style.height = (this.field.elem.offsetHeight / this.field.height) + 'px';
        this.field.elem.appendChild(this.elem);
    }

    canMove(newX: number, newY: number): boolean {
        if (newX < 0 || newX >= this.field.width) return false;
        if (newY < 0 || newY >= this.field.height) return false;
        return true;
    }

    move(newX: number, newY: number): boolean {
        if (!this.canMove(newX, newY)) { return false; }
        this._moveUnchecked(newX, newY);
        return true;
    }

    remove(): void {
        this.elem.remove();
        this.elem = null;
    }

    _moveUnchecked(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.elem.style.left = (this.field.elem.offsetWidth /
            this.field.width * this.x) + 'px';
        this.elem.style.top = (this.field.elem.offsetHeight /
            this.field.height * this.y) + 'px';
    }
}

class Obstacle {
    blocked: Set<number> = new Set<number>();
    squares: Square[] = [];

    _encodeCoords(x: number, y: number): number {
        return 10000 * x + y;
    }
    add(f: Field, x: number, y: number) {
        if (this.has(x, y)) return;
        this.squares.push(new Square(f, x, y));
        this.blocked.add(this._encodeCoords(x, y));
    }
    has(x: number, y: number): boolean {
        return this.blocked.has(this._encodeCoords(x, y));
    }
    dropFullRows(f: Field, rows_: Set<number>): void {
        const rows = [];
        for (const y of rows_) { rows.push(y); }
        rows.sort();
        for (let y of rows) {
            this._dropFullRow(y);
        }
    }
    _dropFullRow(y: number): boolean {
        for (let x = 0; x < f.width; ++x) {
            if (!this.has(x, y)) {
                return false;
            }
        }
        /* Let's rewrite the set and update coords. */
        this.blocked.clear();
        for (let i = 0; i < this.squares.length;) {
            let s = this.squares[i];
            if (s.y == y) {
                s.remove();
                this.squares.splice(i, 1);
                continue;
            } else if (s.y < y) {
                s.move(s.x, s.y + 1);
            }
            this.add(f, s.x, s.y);
            ++i;
        }
        return true;
    }
}

/** Any used block. There are a few standard shapes:
 *  "**",
 *  "***",
 * "**\n**",
 *  "***\n*" and "*\n***".
 * 
 * Shape of the landed block mass is variable, of course.
 * Let's initially support just one block type: 2x2. */
class Block {
    rx: number;
    ry: number;
    coords: number[];
    squares: Square[];
    constructor(f: Field, x: number, y: number) {
        this.squares = [];
        this.initRandom(x, y);
    }
    initRandom(x: number, y: number, obstacle?: Obstacle): boolean {
        this.rx = x;
        this.ry = y;
        const blockType = Math.floor(Math.random() * 3);
        console.log('Block Type: ', blockType);
        switch (blockType) {
            case 0:
                this.coords = [0, 0, 1, 0, 0, 1, 1, 1];
                break;
            case 1:
                this.coords = [-1, 0, 0, 0, 1, 0, 2, 0];
                break;
            case 2:
                this.coords = [0, 0];
                break;
            }
        this.remove();
        for (let i = 0; i < this.coords.length; i += 2) {
            const sx = this.rx + this.coords[i];
            const sy = this.ry + this.coords[i + 1];
            if (typeof obstacle !== 'undefined') {
                if (obstacle.has(sx, sy)) { return false; }
            }
            this.squares.push(new Square(f, sx, sy));
        }
        return true;
    }

    rotateLeft(): boolean { return true; }
    rotateRight(): boolean { return true; }
    move(x: number, y: number, obstacle?: Obstacle): boolean {
        for (let s of this.squares) {
            const sx = x + (s.x - this.rx);
            const sy = y + (s.y - this.ry);
            if (!s.canMove(sx, sy)) {
                return false;
            }
            if (typeof obstacle !== 'undefined') {
                if (obstacle.has(sx, sy)) { return false; }
            }
        }
        for (let s of this.squares) {
            if (!s.move(x + (s.x - this.rx), y + (s.y - this.ry))) {
                console.log('CRITICAL: Wrong move check', x, y, this.rx, this.ry);
                return false;
            }
        }
        this.rx = x;
        this.ry = y;
        return true;
    }
    remove(): void {
        for (let s of this.squares) { s.remove(); }
        this.squares.splice(0);
    }

    mergeTo(field: Field, obstacle: Obstacle): void {
        const rowsToCheck = new Set<number>();
        for (let s of this.squares) {
            obstacle.add(field, s.x, s.y);
            rowsToCheck.add(s.y);
        }
        obstacle.dropFullRows(f, rowsToCheck);
    }
}

class Tetris {
    width: number;
    height: number;
    blockCount: number;

    field: Field;
    counterElement: HTMLElement;
    keyPressed: KeyboardEvent;

    block: Block;  /**< The moving block */
    frozen: Obstacle; /**< Filled space at the bottom */
    timerId: number;

    constructor(f: Field, counterElement: HTMLElement) {
        this.width = 6;
        this.height = 20;
        this.blockCount = 0;
        this.field = f;
        this.counterElement = counterElement;
        this.block = new Block(f, this.width / 2, 0);
        this.frozen = new Obstacle();
        this.keyPressed = null;
        document.body.onkeydown = (ev: KeyboardEvent) => { this.handleKey(ev); }
    }

    handleKey(ev: KeyboardEvent): void {
        if (this.timerId) {
            this.keyPressed = ev;
        } else {
            t.start();
        }
    }
    moveBlockDown(): boolean {
        return this.block.move(this.block.rx, this.block.ry + 1, this.frozen);
    }

    moveBlockSideways(dx: number): boolean {
        return this.block.move(this.block.rx + dx, this.block.ry, this.frozen);
    }

    freezeBlock(): void {
        this.block.mergeTo(this.field, this.frozen);
    }
    start(): void {
        this.timerId = setInterval(() => this.step(), 1000);
    }

    stop(): void {
        clearInterval(this.timerId);
        this.timerId = 0;
    }

    step(): void {
        if (this.keyPressed != null) {
            switch (this.keyPressed.code) {
                case "ArrowLeft": this.moveBlockSideways(-1); break;
                case "ArrowRight": this.moveBlockSideways(1); break;
            }
            this.keyPressed = null;
        }
        if (this.moveBlockDown()) {
            return;
        }
        this.freezeBlock();
        this.blockCount++;
        if (this.counterElement) {
            this.counterElement.innerText = '' + this.blockCount;
        }
        if (!this.block.initRandom(this.width / 2, 0, this.frozen)) { this.stop(); }
    }
}

var f: Field;
var t: Tetris;
function init(w: number, h: number, 
    fieldElement: HTMLElement, counterElement: HTMLElement): void {
    f = new Field(fieldElement, w, h);
    t = new Tetris(f, counterElement);
}
