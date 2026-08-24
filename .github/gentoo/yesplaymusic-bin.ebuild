# Copyright 2026 Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

DESCRIPTION="XuMP - a third-party Netease Cloud Music player"
HOMEPAGE="https://github.com/axuanran/YesPlayMusic"

MY_PV="@RELEASE_VERSION@"
BASE_URI="${HOMEPAGE}/releases/download/v${MY_PV}"

SRC_URI="
	amd64? ( ${BASE_URI}/@AMD64_ASSET@ )
	arm64? ( ${BASE_URI}/@ARM64_ASSET@ )
"

S="${WORKDIR}"
LICENSE="MIT"
SLOT="0"
KEYWORDS="~amd64 ~arm64"

RDEPEND="
	app-accessibility/at-spi2-core:2
	dev-libs/expat
	dev-libs/glib:2
	dev-libs/nspr
	dev-libs/nss
	media-libs/alsa-lib
	media-libs/mesa
	net-print/cups
	sys-apps/dbus
	x11-libs/cairo
	x11-libs/gtk+:3
	x11-libs/libX11
	x11-libs/libXcomposite
	x11-libs/libXdamage
	x11-libs/libXext
	x11-libs/libXfixes
	x11-libs/libXrandr
	x11-libs/libdrm
	x11-libs/libxcb
	x11-libs/libxkbcommon
	x11-libs/pango
"

QA_PREBUILT="opt/XuMP/**"

src_install() {
	insinto /opt/XuMP
	doins -r .

	fperms +x /opt/XuMP/xump
	fperms 4755 /opt/XuMP/chrome-sandbox
	dosym ../../opt/XuMP/xump /usr/bin/xump

	newicon "${FILESDIR}/yesplaymusic.png" xump.png
	domenu "${FILESDIR}/yesplaymusic.desktop"
}
