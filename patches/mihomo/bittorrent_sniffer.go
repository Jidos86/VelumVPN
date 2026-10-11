package sniffer

import (
	"bytes"
	"encoding/binary"
	"errors"

	C "github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/constant/sniffer"
)

const (
	btHandshakePstrlen = 19
	btHandshakeHeader  = "BitTorrent protocol"
	btSniffHost        = "bittorrent.invalid"
	trackerProtocolID  = 0x41727101980
	trackerConnectFlag = 0
	trackerConnectSize = 16
	utpHeaderSize      = 20
	utpTypeSyn         = 4
	stunMagicCookie    = 0x2112A442
)

var errNotBitTorrent = errors.New("not bittorrent")

type BTSniffer struct {
	*BaseSniffer
}

var _ sniffer.Sniffer = (*BTSniffer)(nil)

func NewBTSniffer(snifferConfig SnifferConfig) (*BTSniffer, error) {
	return &BTSniffer{
		BaseSniffer: NewBaseSniffer(snifferConfig.Ports, C.ALLNet),
	}, nil
}

func (bt *BTSniffer) Protocol() string {
	return "bittorrent"
}

func (bt *BTSniffer) SupportNetwork() C.NetWork {
	return C.ALLNet
}

func (bt *BTSniffer) SniffData(b []byte) (string, error) {
	if host, err := sniffBTHandshake(b); err == nil {
		return host, nil
	} else {
		var need *errNeedAtLeastData
		if errors.As(err, &need) {
			return "", err
		}
	}
	if sniffUTP(b) || sniffUDPTracker(b) || sniffDHT(b) {
		return btSniffHost, nil
	}
	return "", errNotBitTorrent
}

func sniffBTHandshake(b []byte) (string, error) {
	if len(b) == 0 {
		return "", &errNeedAtLeastData{length: 1, err: ErrNoClue}
	}
	if b[0] != btHandshakePstrlen {
		return "", errNotBitTorrent
	}
	need := 1 + len(btHandshakeHeader)
	if len(b) < need {
		if bytes.HasPrefix([]byte(btHandshakeHeader), b[1:]) {
			return "", &errNeedAtLeastData{length: need, err: ErrNoClue}
		}
		return "", errNotBitTorrent
	}
	if string(b[1:need]) != btHandshakeHeader {
		return "", errNotBitTorrent
	}
	return btSniffHost, nil
}

func sniffUTP(packet []byte) bool {
	if len(packet) < utpHeaderSize {
		return false
	}
	if len(packet) >= 8 && binary.BigEndian.Uint32(packet[4:8]) == stunMagicCookie {
		return false
	}
	version := packet[0] & 0x0F
	ty := packet[0] >> 4
	// UDPSniff sees only the first datagram of a NAT session. Real uTP starts
	// with ST_SYN (type 4, version 1 → 0x41). Matching ST_DATA/STATE (0x01,
	// 0x21, …) collides with game UDP and WireGuard handshakes and would send
	// those sessions DIRECT.
	if version != 1 || ty != utpTypeSyn {
		return false
	}
	extension := packet[1]
	rest := packet[utpHeaderSize:]
	for extension != 0 {
		if len(rest) < 2 {
			return false
		}
		extension = rest[0]
		length := int(rest[1])
		rest = rest[2:]
		if extension > 0x04 {
			return false
		}
		if len(rest) < length {
			return false
		}
		rest = rest[length:]
	}
	return true
}

func sniffUDPTracker(packet []byte) bool {
	if len(packet) < trackerConnectSize {
		return false
	}
	if binary.BigEndian.Uint64(packet[:8]) != trackerProtocolID {
		return false
	}
	return binary.BigEndian.Uint32(packet[8:12]) == trackerConnectFlag
}

func sniffDHT(packet []byte) bool {
	if len(packet) < 16 || packet[0] != 'd' {
		return false
	}
	if !bytes.Contains(packet, []byte("2:id20:")) {
		return false
	}
	return bytes.Contains(packet, []byte("1:y1:q")) ||
		bytes.Contains(packet, []byte("1:y1:r")) ||
		bytes.Contains(packet, []byte("1:y1:e"))
}
