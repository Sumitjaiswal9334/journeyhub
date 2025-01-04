const express = require('express');
const app = express();
const router = express.Router();
const { isLoggedIn } = require('../middleware');
const Booking = require('../models/booking.js');
const Listing = require('../models/listing.js');

// Display the booking form
router.get('/:id/new',  async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        req.flash('error', 'Listing not found!');
        return res.redirect('/listings');
    }
    res.render('bookings/new', { listing, body : 'bookings/new'  });
});

// Handle booking submission
router.post('/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const { date } = req.body;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash('error', 'Listing not found!');
        return res.redirect('/listings');
    }

    const booking = new Booking({
        listing: id,
        user: req.user._id,
        date: new Date(date),
        price: listing.price,
    });

    await booking.save();
    req.flash('success', 'Booking created! Proceed to payment.');
    res.redirect(`/bookings/${booking._id}/pay`);
});


const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Your Stripe secret key

// Payment page
router.get('/:id/pay', isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('listing');
    if (!booking) {
        req.flash('error', 'Booking not found!');
        return res.redirect('/listings');
    }
    res.render('bookings/pay', { booking, body: 'bookings/pay' });
});

// Handle payment
router.post('/:id/pay', isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('listing');
    if (!booking) {
        req.flash('error', 'Booking not found!');
        return res.redirect('/listings');
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/bookings/${booking._id}/success`,
            cancel_url: `${req.protocol}://${req.get('host')}/bookings/${booking._id}/pay`,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: booking.listing.title,
                        },
                        unit_amount: booking.price * 100,
                    },
                    quantity: 1,
                },
            ],
        });

        booking.paymentStatus = 'Pending';
        await booking.save();

        res.redirect(session.url);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Payment failed. Please try again.');
        res.redirect(`/bookings/${booking._id}/pay`);
    }
});

// Handle payment success
router.get('/:id/success', isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
        req.flash('error', 'Booking not found!');
        return res.redirect('/listings');
    }

    booking.paymentStatus = 'Completed';
    await booking.save();

    req.flash('success', 'Payment successful! Booking confirmed.');
    res.redirect('/listings');
});

module.exports = router;
