const mongoose = require('mongoose');

const imageUsageSchema = new mongoose.Schema({
    currentIndex: {
        type: Number,
        required: true,
        default: 0
    },
    usedIndexes: {
        type: [Number],
        required: true,
        default: []
    }
});

const ImageUsage = mongoose.model('ImageUsage', imageUsageSchema);

module.exports = ImageUsage;