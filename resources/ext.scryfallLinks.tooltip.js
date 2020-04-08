( function () {
	// Hide a tooltip
	function hideTooltip( tip ) {
		tip.popper.style.display = 'none';
		tip.reference.style.cursor = 'progress';
	}

	function showTooltip( tip ) {
		tip.popper.style.removeProperty( 'display' );
	}

	// set tip contents to unreconized card message
	function unrecognizedCard( tip ) {
		tip.setContent( mw.message( 'scryfalllinks-unrecognized-card' ).escaped() );
	}

	// create an image for use as a card tooltip
	function createTooltipImg( tip ) {
		const img = document.createElement( 'img' );
		img.classList.add( 'ext-scryfall-cardimage' );
		img.alt = tip.reference.text;
		img.width = 244;
		return img;
	}

	// Shows a tip that we've previously loaded
	function showCachedTip( tip ) {
		const img = createTooltipImg( tip );
		img.classList.add( tip.reference.dataset.rotationClass );
		img.src = tip.reference.dataset.imgUri;
		tip.setContent( img );
	}

	// get the appropriate image uri from scryfall data
	function getCardImageSource( data, useBackImage ) {
		if ( useBackImage ) {
			return data.card_faces[ 1 ].image_uris.normal;
		} else if ( data.image_uris ) {
			return data.image_uris.normal;
		} else {
			return data.card_faces[ 0 ].image_uris.normal;
		}
	}

	// return a href that links directly to the scryfall card page
	function makeDirectCardPageLink( originalHref, scryfallHref, useBackImage ) {
		const utmSource = new URL( originalHref ).searchParams.get( 'utm_source' ),
			cardPageUri = new URL( scryfallHref );
		cardPageUri.searchParams.set( 'utm_source', utmSource );
		// Must be &back only, not &back=, so have to add it this way
		return useBackImage ? cardPageUri.href + '&back' : cardPageUri.href;
	}

	// make the uri to search for the card on scryfall
	function makeSearchUri( params ) {
		const searchUri = new URL( 'https://api.scryfall.com/cards/named' );
		if ( typeof params.cardSet === 'undefined' || typeof params.cardNumber === 'undefined' || params.cardNumber === '' ) {
			searchUri.searchParams.set( 'exact', params.cardName );
			if ( typeof params.cardSet !== 'undefined' ) {
				searchUri.searchParams.set( 'set', params.cardSet );
			}
		} else {
			searchUri.pathname = 'cards/' + params.cardSet.toLowerCase() + '/' + params.cardNumber.toLowerCase();
		}
		return searchUri;
	}

	// return the appropriate rotation class for a card, null if card is not rotated
	function getRotationClass( data, isSecondface ) {
		var rotationClass = null;
		if ( data.layout === 'planar' || data.name === 'Burning Cinder Fury of Crimson Chaos Fire' ) {
			rotationClass = 'ext-scryfall-rotate-90cw';
		} else if ( data.card_faces ) {
			if ( data.layout === 'split' ) {
				if ( data.card_faces[ 1 ].oracle_text.substring( 0, 9 ) === 'Aftermath' ) {
					if ( isSecondface ) {
						rotationClass = 'ext-scryfall-rotate-90ccw';
					}
				} else {
					rotationClass = 'ext-scryfall-rotate-90cw';
				}
			} else if ( data.layout === 'flip' && isSecondface ) {
				rotationClass = 'ext-scryfall-rotate-180';
			}
		}
		return rotationClass;
	}

	// fet card data from scryfall
	async function fetchCardData( searchUri ) {
		const response = await fetch( searchUri );
		if ( !response.ok ) {
			throw Error( response.status );
		}
		return await response.json();
	}

	// fetch card image and return a 'blob' url to it
	async function fetchImage( url ) {
		const response = await fetch( url, {} );
		if ( !response.ok ) {
			throw Error( response.status );
		}
		return URL.createObjectURL( await response.blob() );
	}

	// fetch scryfall data and initialize the tooltip
	async function fetchCardTooltipAsync( searchUri, tip, img ) {
		var rotationClass, isSecondface = false, useBackImage = false;

		const data = await fetchCardData( searchUri );

		if ( data.card_faces ) {
			isSecondface = data.card_faces[ 0 ].name.replace( /[^a-z]/ig, '' ).toUpperCase() !==
				decodeURIComponent( tip.reference.dataset.cardName ).replace( /[^a-z]/ig, '' ).toUpperCase();
			useBackImage = isSecondface && ( data.layout === 'transform' || data.layout === 'double_faced_token' );
		}

		rotationClass = getRotationClass( data, isSecondface );
		if ( rotationClass !== null ) {
			img.classList.add( rotationClass );
			tip.reference.dataset.rotationClass = rotationClass;
		}

		// Change the card <a> to link directly to the scryfall card page
		tip.reference.href = makeDirectCardPageLink( tip.reference.href,
			data.scryfall_uri,
			useBackImage );

		// fetch the image this way rather than setting the source to the url so
		// that we know when the image download has completed.
		img.src = await fetchImage( getCardImageSource( data, useBackImage ) );
		tip.setContent( img );
		tip.reference.dataset.imgUri = img.src;

		showTooltip( tip );
	}

	// init card tooltip from scryfall
	async function initCardTooltipAsync( tip ) {
		try {
			const img = createTooltipImg( tip ),
				searchUri = makeSearchUri( tip.reference.dataset );
			await fetchCardTooltipAsync( searchUri, tip, img );
			tip.reference.dataset.cached = true;
		} catch ( e ) {
			if ( e.message === '404' ) {
				unrecognizedCard( tip );
				// If we get a 404, we'll also short-circuit all future attempts
				tip.reference.dataset.unrecognized = true;
			} else {
				tip.setContent( 'Preview error' );
			}
			tip.setProps( { theme: 'scryfall-error' } );
			showTooltip( tip );
		} finally {
			// End cursor:progress
			tip.reference.style.removeProperty( 'cursor' );
			tip.loading = false;
		}
	}

	function initTippy() {
		/* global tippy */
		tippy( '.ext-scryfall-cardname', {
			arrow: false,
			followCursor: true,
			touch: 'hold',
			delay: [ 50, 0 ],
			animation: 'fade',
			duration: 0,
			ignoreAttributes: true,
			theme: 'scryfall',
			onShow( tip ) {
				if ( !tip.loading && tip.props.content === '' ) {
					if ( tip.reference.dataset.cached ) {
						showCachedTip( tip );
					} else if ( tip.reference.dataset.unrecognized ) {
						unrecognizedCard( tip );
					} else {
						tip.loading = true;
						hideTooltip( tip );
						initCardTooltipAsync( tip );
					}
				}
			},
			onHidden( tip ) {
				tip.setContent( '' );
			}
		} );
	}

	$( function () {
		mw.loader.using( 'mediawiki.api' ).then( () => {
			return new mw.Api().loadMessagesIfMissing( [ 'scryfalllinks-unrecognized-card' ] );
		} ).then( initTippy );
	} );

}() );
