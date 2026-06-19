// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AportEscrow — DRAFT, UNTESTED. For review only (see docs/PAYMENTS.md).
 *
 * Non-custodial escrow for A-port purchases: a buyer locks an ERC-20 amount
 * (e.g. USDC) for a seller. The platform never holds funds — they sit in this
 * contract until one of:
 *   - buyer confirms        → release to seller
 *   - auto-release timeout  → release to seller (default; protects sellers)
 *   - buyer disputes        → arbiter (executing the NemoClaw verdict) resolves
 *                             to seller (fraud) or back to buyer (refund)
 *
 * A platform fee (basis points) is taken on release to the seller.
 *
 * Production notes: use OpenZeppelin SafeERC20 + ReentrancyGuard + Ownable;
 * make the arbiter a multisig/timelock; add per-escrow events indexing for the
 * backend. This file is a minimal reference, not audited.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AportEscrow {
    enum State { None, Funded, Released, Refunded }

    struct Escrow {
        address buyer;
        address seller;
        address token;       // ERC-20 (e.g. USDC)
        uint256 amount;
        uint64  autoReleaseAt;
        bool    disputed;
        State   state;
        bytes32 articleRef;  // hash/id of the A-port article (off-chain link)
    }

    address public owner;        // can rotate arbiter / fee config
    address public arbiter;      // executes NemoClaw verdicts on disputes
    address public feeRecipient; // A-port fee sink
    uint16  public feeBps;       // platform fee, basis points (e.g. 250 = 2.5%)

    uint256 public nextId = 1;
    mapping(uint256 => Escrow) public escrows;

    uint256 private _locked; // minimal reentrancy guard

    event Funded(uint256 indexed id, address indexed buyer, address indexed seller, address token, uint256 amount, bytes32 articleRef, uint64 autoReleaseAt);
    event Released(uint256 indexed id, address indexed seller, uint256 sellerAmount, uint256 fee);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event Disputed(uint256 indexed id, address indexed buyer);
    event Resolved(uint256 indexed id, bool toSeller);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyArbiter() { require(msg.sender == arbiter, "not arbiter"); _; }
    modifier nonReentrant() { require(_locked == 0, "reentrant"); _locked = 1; _; _locked = 0; }

    constructor(address _arbiter, address _feeRecipient, uint16 _feeBps) {
        require(_feeBps <= 1000, "fee too high"); // cap 10%
        owner = msg.sender;
        arbiter = _arbiter;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    /**
     * Buyer locks `amount` of `token` for `seller`. Buyer must `approve` this
     * contract for `amount` first. `disputeWindow` seconds until auto-release.
     */
    function fund(
        address seller,
        address token,
        uint256 amount,
        bytes32 articleRef,
        uint64 disputeWindow
    ) external nonReentrant returns (uint256 id) {
        require(seller != address(0) && token != address(0), "bad addr");
        require(amount > 0, "zero amount");

        id = nextId++;
        escrows[id] = Escrow({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            autoReleaseAt: uint64(block.timestamp) + disputeWindow,
            disputed: false,
            state: State.Funded,
            articleRef: articleRef
        });

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Funded(id, msg.sender, seller, token, amount, articleRef, escrows[id].autoReleaseAt);
    }

    /// Buyer accepts the data early → release to seller.
    function confirm(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(e.state == State.Funded, "not funded");
        require(msg.sender == e.buyer, "not buyer");
        _release(id, e);
    }

    /// Anyone may trigger release after the window if not disputed (auto-release).
    function release(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(e.state == State.Funded, "not funded");
        require(!e.disputed, "disputed");
        require(block.timestamp >= e.autoReleaseAt, "too early");
        _release(id, e);
    }

    /// Buyer opens a dispute before auto-release; pauses release until arbiter acts.
    function dispute(uint256 id) external {
        Escrow storage e = escrows[id];
        require(e.state == State.Funded, "not funded");
        require(msg.sender == e.buyer, "not buyer");
        require(block.timestamp < e.autoReleaseAt, "window over");
        e.disputed = true;
        emit Disputed(id, msg.sender);
    }

    /// Arbiter executes the NemoClaw verdict on a disputed escrow.
    function resolve(uint256 id, bool toSeller) external onlyArbiter nonReentrant {
        Escrow storage e = escrows[id];
        require(e.state == State.Funded, "not funded");
        require(e.disputed, "not disputed");
        emit Resolved(id, toSeller);
        if (toSeller) {
            _release(id, e);
        } else {
            e.state = State.Refunded;
            require(IERC20(e.token).transfer(e.buyer, e.amount), "refund failed");
            emit Refunded(id, e.buyer, e.amount);
        }
    }

    function _release(uint256 id, Escrow storage e) private {
        e.state = State.Released;
        uint256 fee = (e.amount * feeBps) / 10_000;
        uint256 sellerAmount = e.amount - fee;
        if (fee > 0) {
            require(IERC20(e.token).transfer(feeRecipient, fee), "fee xfer failed");
        }
        require(IERC20(e.token).transfer(e.seller, sellerAmount), "seller xfer failed");
        emit Released(id, e.seller, sellerAmount, fee);
    }

    // --- admin ---
    function setArbiter(address a) external onlyOwner { arbiter = a; }
    function setFee(address recipient, uint16 bps) external onlyOwner {
        require(bps <= 1000, "fee too high");
        feeRecipient = recipient;
        feeBps = bps;
    }
    function transferOwnership(address o) external onlyOwner { owner = o; }
}
