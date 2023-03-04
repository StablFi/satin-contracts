// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../../lib/Base64.sol";
import "../../interface/IERC20.sol";
import "../../interface/IERC721.sol";
import "../../interface/IERC721Metadata.sol";
import "../../interface/IVe.sol";
import "../../interface/IVeDist.sol";
import "../../interface/IERC721Receiver.sol";
import "../../interface/IController.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../../lib/SafeERC20.sol";
import "../../interface/IPair.sol";
import "../../interface/IMultiRewardsPool.sol";
import "../../interface/IBribe.sol";
import "../../interface/IVoter.sol";
import "../../lib/Math.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Ve is IERC721, IERC721Metadata, IVe, Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint internal constant WEEK = 1 weeks;
    uint internal constant MAX_TIME = 365 * 86400;
    int128 internal constant I_MAX_TIME = 365 * 86400;
    uint internal constant MULTIPLIER = 1 ether;

    address public override token;
    address public VeOwner;
    uint public supply;
    uint public fees0;
    uint public fees1;
    mapping(uint => LockedBalance) public locked;

    mapping(uint => uint) public ownershipChange;

    uint public override epoch;
    /// @dev epoch -> unsigned point
    mapping(uint => Point) internal _pointHistory;
    /// @dev user -> Point[userEpoch]
    mapping(uint => Point[1000000000]) internal _userPointHistory;

    mapping(uint => uint) public override userPointEpoch;
    mapping(uint => int128) public slopeChanges; // time -> signed slope change

    mapping(uint => uint) public attachments;
    mapping(uint => bool) public voted;
    address public controller;

    string public constant override name = "veSATIN";
    string public constant override symbol = "veSATIN";
    string public constant version = "1.0.0";
    uint8 public constant decimals = 18;

    /// @dev Current count of token
    uint internal tokenId;

    /// @dev Mapping from NFT ID to the address that owns it.
    mapping(uint => address) internal idToOwner;

    /// @dev Mapping from NFT ID to approved address.
    mapping(uint => address) internal idToApprovals;

    /// @dev Mapping from owner address to count of his tokens.
    mapping(address => uint) internal ownerToNFTokenCount;

    /// @dev Mapping from owner address to mapping of index to tokenIds
    mapping(address => mapping(uint => uint)) internal ownerToNFTokenIdList;

    /// @dev Mapping from NFT ID to index of owner
    mapping(uint => uint) internal tokenToOwnerIndex;

    /// @dev Mapping from owner address to mapping of operator addresses.
    mapping(address => mapping(address => bool)) internal ownerToOperators;

    /// @dev Mapping of interface id to bool about whether or not it's supported
    mapping(bytes4 => bool) internal supportedInterfaces;

    /// @dev Mapping of ownerNFTID => bool
    mapping(uint => bool) internal isOwnerNFTID;

    /// @dev ERC165 interface ID of ERC165
    bytes4 internal constant ERC165_INTERFACE_ID = 0x01ffc9a7;

    /// @dev ERC165 interface ID of ERC721
    bytes4 internal constant ERC721_INTERFACE_ID = 0x80ac58cd;

    /// @dev ERC165 interface ID of ERC721Metadata
    bytes4 internal constant ERC721_METADATA_INTERFACE_ID = 0x5b5e139f;

    event Deposit(address indexed provider, uint tokenId, uint value, uint indexed locktime, DepositType depositType, uint ts);
    event Withdraw(address indexed provider, uint tokenId, uint value, uint ts);
    event Supply(uint prevSupply, uint supply);
    event ClaimFees(address indexed from, uint claimed0, uint claimed1);

    /// @notice Contract constructor
    // constructor(address controller_) {
    //     controller = controller_;
    //     owner = msg.sender;
    //     _pointHistory[0].blk = block.number;
    //     _pointHistory[0].ts = block.timestamp;

    //     supportedInterfaces[ERC165_INTERFACE_ID] = true;
    //     supportedInterfaces[ERC721_INTERFACE_ID] = true;
    //     supportedInterfaces[ERC721_METADATA_INTERFACE_ID] = true;

    //     // mint-ish
    //     emit Transfer(address(0), address(this), tokenId);
    //     // burn-ish
    //     emit Transfer(address(this), address(0), tokenId);
    // }

    function initialize(address controller_) public initializer {
        __ReentrancyGuard_init_unchained();
        controller = controller_;
        VeOwner = msg.sender;
        _pointHistory[0].blk = block.number;
        _pointHistory[0].ts = block.timestamp;

        supportedInterfaces[ERC165_INTERFACE_ID] = true;
        supportedInterfaces[ERC721_INTERFACE_ID] = true;
        supportedInterfaces[ERC721_METADATA_INTERFACE_ID] = true;

        // mint-ish
        emit Transfer(address(0), address(this), tokenId);
        // burn-ish
        emit Transfer(address(this), address(0), tokenId);
    }

    /// @param token_ `ERC20CRV` token address
    function postInitialize(address token_) external {
        require(VeOwner == msg.sender, "Not initializer");
        token = token_;
    }

    function _veDist() internal view returns (address) {
        return IController(controller).veDist();
    }

    function _voter() internal view returns (address) {
        return IController(controller).voter();
    }

    /// @dev Interface identification is specified in ERC-165.
    /// @param _interfaceID Id of the interface
    function supportsInterface(bytes4 _interfaceID) external view override returns (bool) {
        return supportedInterfaces[_interfaceID];
    }

    /// @notice Get the most recently recorded rate of voting power decrease for `_tokenId`
    /// @param _tokenId token of the NFT
    /// @return Value of the slope
    function getLastUserSlope(uint _tokenId) external view returns (int128) {
        uint uEpoch = userPointEpoch[_tokenId];
        return _userPointHistory[_tokenId][uEpoch].slope;
    }

    /// @notice Get the timestamp for checkpoint `_idx` for `_tokenId`
    /// @param _tokenId token of the NFT
    /// @param _idx User epoch number
    /// @return Epoch time of the checkpoint
    function userPointHistoryTs(uint _tokenId, uint _idx) external view returns (uint) {
        return _userPointHistory[_tokenId][_idx].ts;
    }

    /// @notice Get timestamp when `_tokenId`'s lock finishes
    /// @param _tokenId User NFT
    /// @return Epoch time of the lock end
    function lockedEnd(uint _tokenId) external view override returns (uint) {
        return locked[_tokenId].end;
    }

    /// @dev Returns the number of NFTs owned by `_owner`.
    ///      Throws if `_owner` is the zero address. NFTs assigned to the zero address are considered invalid.
    /// @param _owner Address for whom to query the balance.
    function _balance(address _owner) internal view returns (uint) {
        return ownerToNFTokenCount[_owner];
    }

    /// @dev Returns the number of NFTs owned by `_owner`.
    ///      Throws if `_owner` is the zero address. NFTs assigned to the zero address are considered invalid.
    /// @param _owner Address for whom to query the balance.
    function balanceOf(address _owner) external view override returns (uint) {
        return _balance(_owner);
    }

    /// @dev Returns the address of the owner of the NFT.
    /// @param _tokenId The identifier for an NFT.
    function ownerOf(uint _tokenId) public view override returns (address) {
        return idToOwner[_tokenId];
    }

    /// @dev Get the approved address for a single NFT.
    /// @param _tokenId ID of the NFT to query the approval of.
    function getApproved(uint _tokenId) external view override returns (address) {
        return idToApprovals[_tokenId];
    }

    /// @dev Checks if `_operator` is an approved operator for `_owner`.
    /// @param _owner The address that owns the NFTs.
    /// @param _operator The address that acts on behalf of the owner.
    function isApprovedForAll(address _owner, address _operator) external view override returns (bool) {
        return (ownerToOperators[_owner])[_operator];
    }

    /// @dev  Get token by index
    function tokenOfOwnerByIndex(address _owner, uint _tokenIndex) external view returns (uint) {
        return ownerToNFTokenIdList[_owner][_tokenIndex];
    }

    /// @dev Returns whether the given spender can transfer a given token ID
    /// @param _spender address of the spender to query
    /// @param _tokenId uint ID of the token to be transferred
    /// @return bool whether the msg.sender is approved for the given token ID, is an operator of the owner, or is the owner of the token
    function _isApprovedOrOwner(address _spender, uint _tokenId) internal view returns (bool) {
        address owner = idToOwner[_tokenId];
        bool spenderIsOwner = owner == _spender;
        bool spenderIsApproved = _spender == idToApprovals[_tokenId];
        bool spenderIsApprovedForAll = (ownerToOperators[owner])[_spender];
        return spenderIsOwner || spenderIsApproved || spenderIsApprovedForAll;
    }

    function isApprovedOrOwner(address _spender, uint _tokenId) external view override returns (bool) {
        return _isApprovedOrOwner(_spender, _tokenId);
    }

    /// @dev Add a NFT to an index mapping to a given address
    /// @param _to address of the receiver
    /// @param _tokenId uint ID Of the token to be added
    function _addTokenToOwnerList(address _to, uint _tokenId) internal {
        uint currentCount = _balance(_to);

        ownerToNFTokenIdList[_to][currentCount] = _tokenId;
        tokenToOwnerIndex[_tokenId] = currentCount;
    }

    /// @dev Remove a NFT from an index mapping to a given address
    /// @param _from address of the sender
    /// @param _tokenId uint ID Of the token to be removed
    function _removeTokenFromOwnerList(address _from, uint _tokenId) internal {
        // Delete
        uint currentCount = _balance(_from) - 1;
        uint currentIndex = tokenToOwnerIndex[_tokenId];

        if (currentCount == currentIndex) {
            // update ownerToNFTokenIdList
            ownerToNFTokenIdList[_from][currentCount] = 0;
            // update tokenToOwnerIndex
            tokenToOwnerIndex[_tokenId] = 0;
        } else {
            uint lastTokenId = ownerToNFTokenIdList[_from][currentCount];

            // Add
            // update ownerToNFTokenIdList
            ownerToNFTokenIdList[_from][currentIndex] = lastTokenId;
            // update tokenToOwnerIndex
            tokenToOwnerIndex[lastTokenId] = currentIndex;

            // Delete
            // update ownerToNFTokenIdList
            ownerToNFTokenIdList[_from][currentCount] = 0;
            // update tokenToOwnerIndex
            tokenToOwnerIndex[_tokenId] = 0;
        }
    }

    /// @dev Add a NFT to a given address
    ///      Throws if `_tokenId` is owned by someone.
    function _addTokenTo(address _to, uint _tokenId) internal {
        // assume always call on new tokenId or after _removeTokenFrom() call
        // Change the owner
        idToOwner[_tokenId] = _to;
        // Update owner token index tracking
        _addTokenToOwnerList(_to, _tokenId);
        // Change count tracking
        ownerToNFTokenCount[_to] += 1;
    }

    /// @dev Remove a NFT from a given address
    ///      Throws if `_from` is not the current owner.
    function _removeTokenFrom(address _from, uint _tokenId) internal {
        require(idToOwner[_tokenId] == _from, "!owner remove");
        // Change the owner
        idToOwner[_tokenId] = address(0);
        // Update owner token index tracking
        _removeTokenFromOwnerList(_from, _tokenId);
        // Change count tracking
        ownerToNFTokenCount[_from] -= 1;
    }

    /// @dev Execute transfer of a NFT.
    ///      Throws unless `msg.sender` is the current owner, an authorized operator, or the approved
    ///      address for this NFT. (NOTE: `msg.sender` not allowed in internal function so pass `_sender`.)
    ///      Throws if `_to` is the zero address.
    ///      Throws if `_from` is not the current owner.
    ///      Throws if `_tokenId` is not a valid NFT.
    function _transferFrom(address _from, address _to, uint _tokenId, address _sender) internal {
        require(attachments[_tokenId] == 0 && !voted[_tokenId], "attached");
        require(_isApprovedOrOwner(_sender, _tokenId), "!owner sender");
        require(_to != address(0), "dst is zero");
        // from address will be checked in _removeTokenFrom()

        if (idToApprovals[_tokenId] != address(0)) {
            // Reset approvals
            idToApprovals[_tokenId] = address(0);
        }
        _removeTokenFrom(_from, _tokenId);
        _addTokenTo(_to, _tokenId);
        // Set the block of ownership transfer (for Flash NFT protection)
        ownershipChange[_tokenId] = block.number;
        // Log the transfer
        emit Transfer(_from, _to, _tokenId);
    }

    /* TRANSFER FUNCTIONS */
    /// @dev Throws unless `msg.sender` is the current owner, an authorized operator, or the approved address for this NFT.
    ///      Throws if `_from` is not the current owner.
    ///      Throws if `_to` is the zero address.
    ///      Throws if `_tokenId` is not a valid NFT.
    /// @notice The caller is responsible to confirm that `_to` is capable of receiving NFTs or else
    ///        they maybe be permanently lost.
    /// @param _from The current owner of the NFT.
    /// @param _to The new owner.
    /// @param _tokenId The NFT to transfer.
    function transferFrom(address _from, address _to, uint _tokenId) external override {
        _transferFrom(_from, _to, _tokenId, msg.sender);
    }

    function _isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.
        uint size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    /// @dev Transfers the ownership of an NFT from one address to another address.
    ///      Throws unless `msg.sender` is the current owner, an authorized operator, or the
    ///      approved address for this NFT.
    ///      Throws if `_from` is not the current owner.
    ///      Throws if `_to` is the zero address.
    ///      Throws if `_tokenId` is not a valid NFT.
    ///      If `_to` is a smart contract, it calls `onERC721Received` on `_to` and throws if
    ///      the return value is not `bytes4(keccak256("onERC721Received(address,address,uint,bytes)"))`.
    /// @param _from The current owner of the NFT.
    /// @param _to The new owner.
    /// @param _tokenId The NFT to transfer.
    /// @param _data Additional data with no specified format, sent in call to `_to`.
    function safeTransferFrom(address _from, address _to, uint _tokenId, bytes memory _data) public override {
        _transferFrom(_from, _to, _tokenId, msg.sender);

        if (_isContract(_to)) {
            // Throws if transfer destination is a contract which does not implement 'onERC721Received'
            try IERC721Receiver(_to).onERC721Received(msg.sender, _from, _tokenId, _data) returns (bytes4) {} catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert("ERC721: transfer to non ERC721Receiver implementer");
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }

    /// @dev Transfers the ownership of an NFT from one address to another address.
    ///      Throws unless `msg.sender` is the current owner, an authorized operator, or the
    ///      approved address for this NFT.
    ///      Throws if `_from` is not the current owner.
    ///      Throws if `_to` is the zero address.
    ///      Throws if `_tokenId` is not a valid NFT.
    ///      If `_to` is a smart contract, it calls `onERC721Received` on `_to` and throws if
    ///      the return value is not `bytes4(keccak256("onERC721Received(address,address,uint,bytes)"))`.
    /// @param _from The current owner of the NFT.
    /// @param _to The new owner.
    /// @param _tokenId The NFT to transfer.
    function safeTransferFrom(address _from, address _to, uint _tokenId) external override {
        safeTransferFrom(_from, _to, _tokenId, "");
    }

    /// @dev Set or reaffirm the approved address for an NFT. The zero address indicates there is no approved address.
    ///      Throws unless `msg.sender` is the current NFT owner, or an authorized operator of the current owner.
    ///      Throws if `_tokenId` is not a valid NFT. (NOTE: This is not written the EIP)
    ///      Throws if `_approved` is the current owner. (NOTE: This is not written the EIP)
    /// @param _approved Address to be approved for the given NFT ID.
    /// @param _tokenId ID of the token to be approved.
    function approve(address _approved, uint _tokenId) public override {
        address owner = idToOwner[_tokenId];
        // Throws if `_tokenId` is not a valid NFT
        require(owner != address(0), "invalid id");
        // Throws if `_approved` is the current owner
        require(_approved != owner, "self approve");
        // Check requirements
        bool senderIsOwner = (idToOwner[_tokenId] == msg.sender);
        bool senderIsApprovedForAll = (ownerToOperators[owner])[msg.sender];
        require(senderIsOwner || senderIsApprovedForAll, "!owner");
        // Set the approval
        idToApprovals[_tokenId] = _approved;
        emit Approval(owner, _approved, _tokenId);
    }

    /// @dev Enables or disables approval for a third party ("operator") to manage all of
    ///      `msg.sender`'s assets. It also emits the ApprovalForAll event.
    ///      Throws if `_operator` is the `msg.sender`. (NOTE: This is not written the EIP)
    /// @notice This works even if sender doesn't own any tokens at the time.
    /// @param _operator Address to add to the set of authorized operators.
    /// @param _approved True if the operators is approved, false to revoke approval.
    function setApprovalForAll(address _operator, bool _approved) external override {
        // Throws if `_operator` is the `msg.sender`
        require(_operator != msg.sender, "operator is sender");
        ownerToOperators[msg.sender][_operator] = _approved;
        emit ApprovalForAll(msg.sender, _operator, _approved);
    }

    /// @dev Function to mint tokens
    ///      Throws if `_to` is zero address.
    ///      Throws if `_tokenId` is owned by someone.
    /// @param _to The address that will receive the minted tokens.
    /// @param _tokenId The token id to mint.
    /// @return A boolean that indicates if the operation was successful.
    function _mint(address _to, uint _tokenId) internal returns (bool) {
        // Throws if `_to` is zero address
        require(_to != address(0), "zero dst");
        // Add NFT. Throws if `_tokenId` is owned by someone
        _addTokenTo(_to, _tokenId);
        emit Transfer(address(0), _to, _tokenId);
        return true;
    }

    /// @notice Record global and per-user data to checkpoint
    /// @param _tokenId NFT token ID. No user checkpoint if 0
    /// @param oldLocked Pevious locked amount / end lock time for the user
    /// @param newLocked New locked amount / end lock time for the user
    function _checkpoint(uint _tokenId, LockedBalance memory oldLocked, LockedBalance memory newLocked) internal {
        Point memory uOld;
        Point memory uNew;
        int128 oldDSlope = 0;
        int128 newDSlope = 0;
        uint _epoch = epoch;

        if (_tokenId != 0) {
            // Calculate slopes and biases
            // Kept at zero when they have to
            if (oldLocked.end > block.timestamp && oldLocked.amount > 0) {
                uOld.slope = oldLocked.amount / I_MAX_TIME;
                uOld.bias = uOld.slope * int128(int256(oldLocked.end - block.timestamp));
            }
            if (newLocked.end > block.timestamp && newLocked.amount > 0) {
                uNew.slope = newLocked.amount / I_MAX_TIME;
                uNew.bias = uNew.slope * int128(int256(newLocked.end - block.timestamp));
            }

            // Read values of scheduled changes in the slope
            // oldLocked.end can be in the past and in the future
            // newLocked.end can ONLY by in the FUTURE unless everything expired: than zeros
            oldDSlope = slopeChanges[oldLocked.end];
            if (newLocked.end != 0) {
                if (newLocked.end == oldLocked.end) {
                    newDSlope = oldDSlope;
                } else {
                    newDSlope = slopeChanges[newLocked.end];
                }
            }
        }

        Point memory lastPoint = Point({bias: 0, slope: 0, ts: block.timestamp, blk: block.number});
        if (_epoch > 0) {
            lastPoint = _pointHistory[_epoch];
        }
        uint lastCheckpoint = lastPoint.ts;
        // initialLastPoint is used for extrapolation to calculate block number
        // (approximately, for *At methods) and save them
        // as we cannot figure that out exactly from inside the contract
        Point memory initialLastPoint = lastPoint;
        uint blockSlope = 0;
        // dblock/dt
        if (block.timestamp > lastPoint.ts) {
            blockSlope = (MULTIPLIER * (block.number - lastPoint.blk)) / (block.timestamp - lastPoint.ts);
        }
        // If last point is already recorded in this block, slope=0
        // But that's ok b/c we know the block in such case

        // Go over weeks to fill history and calculate what the current point is
        {
            uint ti = (lastCheckpoint / WEEK) * WEEK;
            // Hopefully it won't happen that this won't get used in 5 years!
            // If it does, users will be able to withdraw but vote weight will be broken
            for (uint i = 0; i < 255; ++i) {
                ti += WEEK;
                int128 dSlope = 0;
                if (ti > block.timestamp) {
                    ti = block.timestamp;
                } else {
                    dSlope = slopeChanges[ti];
                }
                lastPoint.bias = Math.positiveInt128(lastPoint.bias - lastPoint.slope * int128(int256(ti - lastCheckpoint)));
                lastPoint.slope = Math.positiveInt128(lastPoint.slope + dSlope);
                lastCheckpoint = ti;
                lastPoint.ts = ti;
                lastPoint.blk = initialLastPoint.blk + (blockSlope * (ti - initialLastPoint.ts)) / MULTIPLIER;
                _epoch += 1;
                if (ti == block.timestamp) {
                    lastPoint.blk = block.number;
                    break;
                } else {
                    _pointHistory[_epoch] = lastPoint;
                }
            }
        }

        epoch = _epoch;
        // Now pointHistory is filled until t=now

        if (_tokenId != 0) {
            // If last point was in this block, the slope change has been applied already
            // But in such case we have 0 slope(s)
            lastPoint.slope = Math.positiveInt128(lastPoint.slope + (uNew.slope - uOld.slope));
            lastPoint.bias = Math.positiveInt128(lastPoint.bias + (uNew.bias - uOld.bias));
        }

        // Record the changed point into history
        _pointHistory[_epoch] = lastPoint;

        if (_tokenId != 0) {
            // Schedule the slope changes (slope is going down)
            // We subtract newUserSlope from [newLocked.end]
            // and add old_user_slope to [old_locked.end]
            if (oldLocked.end > block.timestamp) {
                // old_dslope was <something> - u_old.slope, so we cancel that
                oldDSlope += uOld.slope;
                if (newLocked.end == oldLocked.end) {
                    oldDSlope -= uNew.slope;
                    // It was a new deposit, not extension
                }
                slopeChanges[oldLocked.end] = oldDSlope;
            }

            if (newLocked.end > block.timestamp) {
                if (newLocked.end > oldLocked.end) {
                    newDSlope -= uNew.slope;
                    // old slope disappeared at this point
                    slopeChanges[newLocked.end] = newDSlope;
                }
                // else: we recorded it already in oldDSlope
            }
            // Now handle user history
            uint userEpoch = userPointEpoch[_tokenId] + 1;

            userPointEpoch[_tokenId] = userEpoch;
            uNew.ts = block.timestamp;
            uNew.blk = block.number;
            _userPointHistory[_tokenId][userEpoch] = uNew;
        }
    }

    /// @notice Deposit and lock tokens for a user
    /// @param _tokenId NFT that holds lock
    /// @param _value Amount to deposit
    /// @param unlockTime New time when to unlock the tokens, or 0 if unchanged
    /// @param lockedBalance Previous locked amount / timestamp
    /// @param depositType The type of deposit
    function _depositFor(uint _tokenId, uint _value, uint unlockTime, LockedBalance memory lockedBalance, DepositType depositType) internal {
        LockedBalance memory _locked = lockedBalance;
        uint supplyBefore = supply;

        supply = supplyBefore + _value;
        LockedBalance memory oldLocked;
        (oldLocked.amount, oldLocked.end) = (_locked.amount, _locked.end);
        // Adding to existing lock, or if a lock is expired - creating a new one
        _locked.amount += int128(int256(_value));
        if (unlockTime != 0) {
            _locked.end = unlockTime;
        }
        locked[_tokenId] = _locked;

        // Possibilities:
        // Both old_locked.end could be current or expired (>/< block.timestamp)
        // value == 0 (extend lock) or value > 0 (add to lock or extend lock)
        // _locked.end > block.timestamp (always)
        _checkpoint(_tokenId, oldLocked, _locked);

        address from = msg.sender;
        if (_value != 0 && depositType != DepositType.MERGE_TYPE) {
            IERC20(token).safeTransferFrom(from, address(this), _value);
        }

        emit Deposit(from, _tokenId, _value, _locked.end, depositType, block.timestamp);
        emit Supply(supplyBefore, supplyBefore + _value);
    }

    /// @notice Deposit and lock tokens for owner
    /// @param _tokenId NFT that holds lock
    /// @param _value Amount to deposit
    /// @param unlockTime New time when to unlock the tokens, or 0 if unchanged
    /// @param lockedBalance Previous locked amount / timestamp
    /// @param depositType The type of deposit
    function _depositForOwner(uint _tokenId, uint _value, uint unlockTime, LockedBalance memory lockedBalance, DepositType depositType) internal {
        LockedBalance memory _locked = lockedBalance;
        uint supplyBefore = supply;

        supply = supplyBefore + _value;
        LockedBalance memory oldLocked;
        (oldLocked.amount, oldLocked.end) = (_locked.amount, _locked.end);
        // Adding to existing lock, or if a lock is expired - creating a new one
        _locked.amount += int128(int256(_value));
        if (unlockTime != 0) {
            _locked.end = unlockTime;
        }
        locked[_tokenId] = _locked;

        // Possibilities:
        // Both old_locked.end could be current or expired (>/< block.timestamp)
        // value == 0 (extend lock) or value > 0 (add to lock or extend lock)
        // _locked.end > block.timestamp (always)
        _checkpoint(_tokenId, oldLocked, _locked);

        address from = msg.sender;
        // if (_value != 0 && depositType != DepositType.MERGE_TYPE) {
        //     IERC20(token).safeTransferFrom(from, address(this), _value);
        // }

        emit Deposit(from, _tokenId, _value, _locked.end, depositType, block.timestamp);
        emit Supply(supplyBefore, supplyBefore + _value);
    }

    function voting(uint _tokenId) external override {
        require(msg.sender == _voter(), "!voter");
        voted[_tokenId] = true;
    }

    function abstain(uint _tokenId) external override {
        require(msg.sender == _voter(), "!voter");
        voted[_tokenId] = false;
    }

    function attachToken(uint _tokenId) external override {
        require(msg.sender == _voter(), "!voter");
        attachments[_tokenId] = attachments[_tokenId] + 1;
    }

    function detachToken(uint _tokenId) external override {
        require(msg.sender == _voter(), "!voter");
        attachments[_tokenId] = attachments[_tokenId] - 1;
    }

    function merge(uint _from, uint _to) external {
        require(!isOwnerNFTID[_from], "OwnerNFT");
        require(!isOwnerNFTID[_to], "OwnerNFT");
        require(attachments[_from] == 0 && !voted[_from], "attached");
        require(_from != _to, "the same");
        require(_isApprovedOrOwner(msg.sender, _from), "!owner from");
        require(_isApprovedOrOwner(msg.sender, _to), "!owner to");

        LockedBalance memory _locked0 = locked[_from];
        LockedBalance memory _locked1 = locked[_to];
        uint value0 = uint(int256(_locked0.amount));
        uint end = _locked0.end >= _locked1.end ? _locked0.end : _locked1.end;

        require(end > block.timestamp, "expired"); //<== CHECK NOT EXPIRED
        supply -= value0; //<== ADJUST SUPPLY CORRECTLY

        IVeDist(_veDist()).claim(_from);
        locked[_from] = LockedBalance(0, 0);
        _checkpoint(_from, _locked0, LockedBalance(0, 0));
        _burn(_from);
        _depositFor(_to, value0, end, _locked1, DepositType.MERGE_TYPE);
    }

    function block_number() external view returns (uint) {
        return block.number;
    }

    /// @notice Record global data to checkpoint
    function checkpoint() external override {
        _checkpoint(0, LockedBalance(0, 0), LockedBalance(0, 0));
    }

    /// @notice Deposit `_value` tokens for `_tokenId` and add to the lock
    /// @dev Anyone (even a smart contract) can deposit for someone else, but
    ///      cannot extend their locktime and deposit for a brand new user
    /// @param _tokenId lock NFT
    /// @param _value Amount to add to user's lock
    function depositFor(uint _tokenId, uint _value) external override nonReentrant {
        require(_value > 0, "zero value");
        LockedBalance memory _locked = locked[_tokenId];
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");
        _depositFor(_tokenId, _value, 0, _locked, DepositType.DEPOSIT_FOR_TYPE);
    }

    /// @notice Deposit `_value` tokens for `_to` and lock for `_lock_duration`
    /// @param _value Amount to deposit
    /// @param _lockDuration Number of seconds to lock tokens for (rounded down to nearest week)
    /// @param _to Address to deposit
    function _createLock(uint _value, uint _lockDuration, address _to) internal returns (uint) {
        require(_value > 0, "zero value");
        // Lock time is rounded down to weeks
        uint unlockTime = ((block.timestamp + _lockDuration) / WEEK) * WEEK;
        require(unlockTime > block.timestamp, "Can only lock until time in the future");
        require(unlockTime <= block.timestamp + MAX_TIME, "Voting lock can be 1 year max");

        ++tokenId;
        uint _tokenId = tokenId;
        _mint(_to, _tokenId);

        _depositFor(_tokenId, _value, unlockTime, locked[_tokenId], DepositType.CREATE_LOCK_TYPE);
        return _tokenId;
    }

    /// @notice Deposit `_value` tokens for `_to` and lock for `_lock_duration`
    /// @param _value Amount to deposit
    /// @param _lockDuration Number of seconds to lock tokens for (rounded down to nearest week)
    /// @param _to Address to deposit
    function createLockFor(uint _value, uint _lockDuration, address _to) external override nonReentrant returns (uint) {
        return _createLock(_value, _lockDuration, _to);
    }

    /// @notice Deposit `_value` tokens for `msg.sender` and lock for `_lock_duration`
    /// @param _value Amount to deposit
    /// @param _lockDuration Number of seconds to lock tokens for (rounded down to nearest week)
    function createLock(uint _value, uint _lockDuration) external nonReentrant returns (uint) {
        return _createLock(_value, _lockDuration, msg.sender);
    }

    /// @notice Deposit `_value` additional tokens for `_tokenId` without modifying the unlock time
    /// @param _value Amount of tokens to deposit and add to the lock
    function increaseAmount(uint _tokenId, uint _value) external nonReentrant {
        LockedBalance memory _locked = locked[_tokenId];
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");
        require(_isApprovedOrOwner(msg.sender, _tokenId), "!owner");
        require(_value > 0, "zero value");
        require(!isOwnerNFTID[_tokenId], "OwnerNFT");

        _depositFor(_tokenId, _value, 0, _locked, DepositType.INCREASE_LOCK_AMOUNT);
    }

    /// @notice Extend the unlock time for `_tokenId`
    /// @param _lockDuration New number of seconds until tokens unlock
    function increaseUnlockTime(uint _tokenId, uint _lockDuration) external nonReentrant {
        require(!isOwnerNFTID[_tokenId], "OwnerNFT");
        LockedBalance memory _locked = locked[_tokenId];
        // Lock time is rounded down to weeks
        uint unlockTime = ((block.timestamp + _lockDuration) / WEEK) * WEEK;
        require(_locked.amount > 0, "Nothing is locked");
        require(_locked.end > block.timestamp, "Lock expired");
        require(unlockTime > _locked.end, "Can only increase lock duration");
        require(unlockTime <= block.timestamp + MAX_TIME, "Voting lock can be 1 year max");
        require(_isApprovedOrOwner(msg.sender, _tokenId), "!owner");

        _depositFor(_tokenId, 0, unlockTime, _locked, DepositType.INCREASE_UNLOCK_TIME);
    }

    /// @notice Withdraw all tokens for `_tokenId`
    /// @dev Only possible if the lock has expired
    function withdraw(uint _tokenId) external nonReentrant {
        require(!isOwnerNFTID[_tokenId], "OwnerNFT");
        require(_isApprovedOrOwner(msg.sender, _tokenId), "!owner");
        require(attachments[_tokenId] == 0 && !voted[_tokenId], "attached");
        LockedBalance memory _locked = locked[_tokenId];
        require(block.timestamp >= _locked.end, "The lock did not expire");

        uint value = uint(int256(_locked.amount));
        IVeDist(_veDist()).claim(_tokenId);
        locked[_tokenId] = LockedBalance(0, 0);
        uint supplyBefore = supply;
        supply = supplyBefore - value;

        // old_locked can have either expired <= timestamp or zero end
        // _locked has only 0 end
        // Both can have >= 0 amount
        _checkpoint(_tokenId, _locked, LockedBalance(0, 0));

        IERC20(token).safeTransfer(msg.sender, value);

        // Burn the NFT
        _burn(_tokenId);

        emit Withdraw(msg.sender, _tokenId, value, block.timestamp);
        emit Supply(supplyBefore, supplyBefore - value);
    }

    // The following ERC20/minime-compatible methods are not real balanceOf and supply!
    // They measure the weights for the purpose of voting, so they don't represent
    // real coins.

    /// @notice Binary search to estimate timestamp for block number
    /// @param _block Block to find
    /// @param maxEpoch Don't go beyond this epoch
    /// @return Approximate timestamp for block
    function _findBlockEpoch(uint _block, uint maxEpoch) internal view returns (uint) {
        // Binary search
        uint _min = 0;
        uint _max = maxEpoch;
        for (uint i = 0; i < 128; ++i) {
            // Will be always enough for 128-bit numbers
            if (_min >= _max) {
                break;
            }
            uint _mid = (_min + _max + 1) / 2;
            if (_pointHistory[_mid].blk <= _block) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    /// @notice Gets the total voting power.
    /// @dev Adheres to the ERC20 `balanceOf` interface for Aragon compatibility
    /// @return totalVotingPower total voting power
    function getTotalVotingPower() external view override returns (uint totalVotingPower) {
        totalVotingPower = 0;
        for (uint i = 1; i <= tokenId; i++) {
            totalVotingPower += _balanceOfNFT(i, block.timestamp);
        }
    }

    /// @notice Get the current voting power for `_tokenId`
    /// @dev Adheres to the ERC20 `balanceOf` interface for Aragon compatibility
    /// @param _tokenId NFT for lock
    /// @param _t Epoch time to return voting power at
    /// @return User voting power
    function _balanceOfNFT(uint _tokenId, uint _t) internal view returns (uint) {
        uint _epoch = userPointEpoch[_tokenId];
        if (_epoch == 0) {
            return 0;
        } else {
            Point memory lastPoint = _userPointHistory[_tokenId][_epoch];
            lastPoint.bias -= lastPoint.slope * int128(int256(_t) - int256(lastPoint.ts));
            if (lastPoint.bias < 0) {
                lastPoint.bias = 0;
            }
            return uint(int256(lastPoint.bias));
        }
    }

    /// @dev Returns current token URI metadata
    /// @param _tokenId Token ID to fetch URI for.
    function tokenURI(uint _tokenId) external view override returns (string memory) {
        require(idToOwner[_tokenId] != address(0), "Query for nonexistent token");
        LockedBalance memory _locked = locked[_tokenId];
        return _tokenURI(_tokenId, _balanceOfNFT(_tokenId, block.timestamp), _locked.end, uint(int256(_locked.amount)));
    }

    function balanceOfNFT(uint _tokenId) external view override returns (uint) {
        // flash NFT protection
        if (ownershipChange[_tokenId] == block.number) {
            return 0;
        }
        return _balanceOfNFT(_tokenId, block.timestamp);
    }

    function balanceOfNFTAt(uint _tokenId, uint _t) external view returns (uint) {
        return _balanceOfNFT(_tokenId, _t);
    }

    /// @notice Measure voting power of `_tokenId` at block height `_block`
    /// @dev Adheres to MiniMe `balanceOfAt` interface: https://github.com/Giveth/minime
    /// @param _tokenId User's wallet NFT
    /// @param _block Block to calculate the voting power at
    /// @return Voting power
    function _balanceOfAtNFT(uint _tokenId, uint _block) internal view returns (uint) {
        // Copying and pasting totalSupply code because Vyper cannot pass by
        // reference yet
        require(_block <= block.number, "only old block");

        // Binary search
        uint _min = 0;
        uint _max = userPointEpoch[_tokenId];
        for (uint i = 0; i < 128; ++i) {
            // Will be always enough for 128-bit numbers
            if (_min >= _max) {
                break;
            }
            uint _mid = (_min + _max + 1) / 2;
            if (_userPointHistory[_tokenId][_mid].blk <= _block) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }

        Point memory uPoint = _userPointHistory[_tokenId][_min];

        uint maxEpoch = epoch;
        uint _epoch = _findBlockEpoch(_block, maxEpoch);
        Point memory point0 = _pointHistory[_epoch];
        uint dBlock = 0;
        uint dt = 0;
        if (_epoch < maxEpoch) {
            Point memory point1 = _pointHistory[_epoch + 1];
            dBlock = point1.blk - point0.blk;
            dt = point1.ts - point0.ts;
        } else {
            dBlock = block.number - point0.blk;
            dt = block.timestamp - point0.ts;
        }
        uint blockTime = point0.ts;
        if (dBlock != 0 && _block > point0.blk) {
            blockTime += (dt * (_block - point0.blk)) / dBlock;
        }

        uPoint.bias -= uPoint.slope * int128(int256(blockTime - uPoint.ts));
        return uint(uint128(Math.positiveInt128(uPoint.bias)));
    }

    function balanceOfAtNFT(uint _tokenId, uint _block) external view returns (uint) {
        return _balanceOfAtNFT(_tokenId, _block);
    }

    function claimFees() external nonReentrant returns (uint claimed0, uint claimed1) {
        return _claimFees();
    }

    function _claimFees() internal returns (uint claimed0, uint claimed1) {
        address _underlying = token;
        (claimed0, claimed1) = IPair(_underlying).claimFees();
        address gauge = IVoter(_voter()).gauges(token);
        address bribe = IVoter(_voter()).bribes(gauge);
        if (claimed0 > 0 || claimed1 > 0) {
            uint _fees0 = fees0 + claimed0;
            uint _fees1 = fees1 + claimed1;
            (address _token0, address _token1) = IPair(_underlying).tokens();
            if (_fees0 > IMultiRewardsPool(bribe).left(_token0)) {
                fees0 = 0;
                IERC20(_token0).safeIncreaseAllowance(bribe, _fees0);
                IBribe(bribe).notifyRewardAmount(_token0, _fees0);
            } else {
                fees0 = _fees0;
            }
            if (_fees1 > IMultiRewardsPool(bribe).left(_token1)) {
                fees1 = 0;
                IERC20(_token1).safeIncreaseAllowance(bribe, _fees1);
                IBribe(bribe).notifyRewardAmount(_token1, _fees1);
            } else {
                fees1 = _fees1;
            }

            emit ClaimFees(msg.sender, claimed0, claimed1);
        }
    }

    /// @notice Calculate total voting power at some point in the past
    /// @param point The point (bias/slope) to start search from
    /// @param t Time to calculate the total voting power at
    /// @return Total voting power at that time
    function _supplyAt(Point memory point, uint t) internal view returns (uint) {
        Point memory lastPoint = point;
        uint ti = (lastPoint.ts / WEEK) * WEEK;
        for (uint i = 0; i < 255; ++i) {
            ti += WEEK;
            int128 dSlope = 0;
            if (ti > t) {
                ti = t;
            } else {
                dSlope = slopeChanges[ti];
            }
            lastPoint.bias -= lastPoint.slope * int128(int256(ti - lastPoint.ts));
            if (ti == t) {
                break;
            }
            lastPoint.slope += dSlope;
            lastPoint.ts = ti;
        }
        return uint(uint128(Math.positiveInt128(lastPoint.bias)));
    }

    /// @notice Calculate total voting power
    /// @dev Adheres to the ERC20 `totalSupply` interface for Aragon compatibility
    /// @return Total voting power
    function totalSupplyAtT(uint t) public view returns (uint) {
        uint _epoch = epoch;
        Point memory lastPoint = _pointHistory[_epoch];
        return _supplyAt(lastPoint, t);
    }

    function totalSupply() external view returns (uint) {
        return totalSupplyAtT(block.timestamp);
    }

    /// @notice Calculate total voting power at some point in the past
    /// @param _block Block to calculate the total voting power at
    /// @return Total voting power at `_block`
    function totalSupplyAt(uint _block) external view returns (uint) {
        require(_block <= block.number, "only old blocks");
        uint _epoch = epoch;
        uint targetEpoch = _findBlockEpoch(_block, _epoch);

        Point memory point = _pointHistory[targetEpoch];
        // it is possible only for a block before the launch
        // return 0 as more clear answer than revert
        if (point.blk > _block) {
            return 0;
        }
        uint dt = 0;
        if (targetEpoch < _epoch) {
            Point memory point_next = _pointHistory[targetEpoch + 1];
            // next point block can not be the same or lower
            dt = ((_block - point.blk) * (point_next.ts - point.ts)) / (point_next.blk - point.blk);
        } else {
            if (point.blk != block.number) {
                dt = ((_block - point.blk) * (block.timestamp - point.ts)) / (block.number - point.blk);
            }
        }
        // Now dt contains info on how far are we beyond point
        return _supplyAt(point, point.ts + dt);
    }

    function _tokenURI(uint _tokenId, uint _balanceOf, uint _locked_end, uint _value) internal pure returns (string memory output) {
        output = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 350 350"><style>.base { fill: black; font-family: Impact; font-size: 50px; }</style><rect width="100%" height="100%" fill="#aaaaff" /><text x="10" y="60" class="base">';
        output = string(abi.encodePacked(output, "token ", _toString(_tokenId), '</text><text x="10" y="150" class="base">'));
        output = string(abi.encodePacked(output, "balanceOf ", _toString(_balanceOf), '</text><text x="10" y="230" class="base">'));
        output = string(abi.encodePacked(output, "locked_end ", _toString(_locked_end), '</text><text x="10" y="310" class="base">'));
        output = string(abi.encodePacked(output, "value ", _toString(_value), "</text></svg>"));

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "lock #',
                        _toString(_tokenId),
                        '", "description": "Satin locks, can be used to boost gauge yields, vote on token emission, and receive bribes", "image": "data:image/svg+xml;base64,',
                        Base64.encode(bytes(output)),
                        '"}'
                    )
                )
            )
        );
        output = string(abi.encodePacked("data:application/json;base64,", json));
    }

    function _toString(uint value) internal pure returns (string memory) {
        // Inspired by OraclizeAPI's implementation - MIT license
        // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

        if (value == 0) {
            return "0";
        }
        uint temp = value;
        uint digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _burn(uint _tokenId) internal {
        address owner = ownerOf(_tokenId);
        // Clear approval
        approve(address(0), _tokenId);
        // Remove token
        _removeTokenFrom(msg.sender, _tokenId);
        emit Transfer(owner, address(0), _tokenId);
    }

    function userPointHistory(uint _tokenId, uint _loc) external view override returns (Point memory) {
        return _userPointHistory[_tokenId][_loc];
    }

    function pointHistory(uint _loc) external view override returns (Point memory) {
        return _pointHistory[_loc];
    }

    // ADMIN FUNCTIONS
    function createLockForOwner(uint _value, uint _lockDuration, address _to) external returns (uint) {
        require(msg.sender == VeOwner, "!VeOwner");
        require(_value > 0, "zero value");
        // Lock time is rounded down to weeks
        uint unlockTime = ((block.timestamp + _lockDuration) / WEEK) * WEEK;
        require(unlockTime > block.timestamp, "Can only lock until time in the future");
        require(unlockTime <= block.timestamp + MAX_TIME, "Voting lock can be 1 year max");

        ++tokenId;
        uint _tokenId = tokenId;
        isOwnerNFTID[_tokenId] = true;
        _mint(_to, _tokenId);

        _depositForOwner(_tokenId, _value, unlockTime, locked[_tokenId], DepositType.CREATE_LOCK_TYPE);
        return _tokenId;
    }
}
